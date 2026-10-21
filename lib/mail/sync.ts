import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decryptSecret } from "./crypto";
import { MailboxAuthError, logMailEvent, logMailFailure } from "./errors";
import { fetchMailboxMail } from "./imap";
import { noteEmailReceived } from "./pipeline";
import { isEmailAddress, normalizeEmail } from "./text";

type LeadHit = { id: number; status: string; name: string };

async function leadsByEmail(userId: number) {
  const leads = await db().query.leads.findMany({
    where: eq(schema.leads.userId, userId),
    columns: { id: true, email: true, status: true, name: true },
    orderBy: [desc(schema.leads.lastActivityAt)],
  });
  const byEmail = new Map<string, LeadHit>();
  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, { id: lead.id, status: lead.status, name: lead.name });
  }
  return byEmail;
}

export async function syncMailbox(userId: number, accountId: number) {
  const account = await db().query.emailAccounts.findFirst({
    where: and(eq(schema.emailAccounts.id, accountId), eq(schema.emailAccounts.userId, userId)),
  });
  if (!account || account.status !== "connected") return { inserted: 0, error: null as string | null };

  try {
    const password = decryptSecret(account.secretCiphertext);
    const fetched = await fetchMailboxMail(account, password, account.lastSyncedAt);
    const leads = await leadsByEmail(userId);
    const seen = new Set<string>();
    const values = [];
    for (const mail of fetched) {
      if (seen.has(mail.messageId)) continue;
      seen.add(mail.messageId);
      const lead = leads.get(mail.counterparty) ?? null;
      values.push({
        userId,
        accountId: account.id,
        leadId: lead?.id ?? null,
        direction: mail.direction,
        messageId: mail.messageId,
        counterparty: mail.counterparty,
        fromAddress: mail.fromAddress,
        toAddress: mail.toAddress,
        subject: mail.subject,
        bodyText: mail.bodyText,
        sentAt: mail.sentAt,
      });
    }

    const inserted: { direction: string; counterparty: string; fromAddress: string }[] = [];
    for (let i = 0; i < values.length; i += 50) {
      const rows = await db()
        .insert(schema.emailMessages)
        .values(values.slice(i, i + 50))
        .onConflictDoNothing({
          target: [schema.emailMessages.accountId, schema.emailMessages.messageId],
        })
        .returning({
          direction: schema.emailMessages.direction,
          counterparty: schema.emailMessages.counterparty,
          fromAddress: schema.emailMessages.fromAddress,
        });
      inserted.push(...rows);
    }

    for (const row of inserted) {
      if (row.direction !== "inbound") continue;
      const lead = leads.get(row.counterparty);
      if (!lead) continue;
      await noteEmailReceived(userId, lead, row.fromAddress || row.counterparty);
    }

    await db()
      .update(schema.emailAccounts)
      .set({ lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(and(eq(schema.emailAccounts.id, account.id), eq(schema.emailAccounts.userId, userId)));
    logMailEvent("mailbox_synced", { userId, accountId: account.id, inserted: inserted.length });
    return { inserted: inserted.length, error: null as string | null };
  } catch (err) {
    const message = err instanceof MailboxAuthError ? err.message : "Could not read new mail from this mailbox.";
    logMailFailure("mailbox_sync_failed", err, { userId, accountId: account.id });
    await db()
      .update(schema.emailAccounts)
      .set({ lastError: message, updatedAt: new Date() })
      .where(and(eq(schema.emailAccounts.id, account.id), eq(schema.emailAccounts.userId, userId)));
    return { inserted: 0, error: message };
  }
}

export async function syncAllMailboxes(userId: number) {
  const accounts = await db().query.emailAccounts.findMany({
    where: and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.status, "connected")),
  });
  const results = await Promise.all(
    accounts.map(async (account) => {
      const result = await syncMailbox(userId, account.id);
      return { accountId: account.id, address: account.address, ...result };
    })
  );
  return results.filter((result) => result.error);
}

export type ThreadSummary = {
  counterparty: string;
  subject: string;
  preview: string;
  lastAt: string;
  direction: string;
  accountId: number;
  accountAddress: string;
  leadId: number | null;
  leadName: string | null;
};

export async function listThreads(userId: number): Promise<ThreadSummary[]> {
  const rows = await db()
    .select({
      counterparty: schema.emailMessages.counterparty,
      subject: schema.emailMessages.subject,
      bodyText: schema.emailMessages.bodyText,
      sentAt: schema.emailMessages.sentAt,
      direction: schema.emailMessages.direction,
      accountId: schema.emailMessages.accountId,
      leadId: schema.emailMessages.leadId,
      accountAddress: schema.emailAccounts.address,
      leadName: schema.leads.name,
    })
    .from(schema.emailMessages)
    .innerJoin(schema.emailAccounts, eq(schema.emailMessages.accountId, schema.emailAccounts.id))
    .leftJoin(schema.leads, eq(schema.emailMessages.leadId, schema.leads.id))
    .where(eq(schema.emailMessages.userId, userId))
    .orderBy(desc(schema.emailMessages.sentAt))
    .limit(2000);

  const threads: ThreadSummary[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.counterparty)) continue;
    seen.add(row.counterparty);
    threads.push({
      counterparty: row.counterparty,
      subject: row.subject,
      preview: row.bodyText.replace(/\s+/g, " ").slice(0, 90),
      lastAt: row.sentAt.toISOString(),
      direction: row.direction,
      accountId: row.accountId,
      accountAddress: row.accountAddress,
      leadId: row.leadId,
      leadName: row.leadName,
    });
  }
  return threads;
}

export async function threadMessages(userId: number, counterparty: string) {
  const email = normalizeEmail(counterparty);
  if (!isEmailAddress(email)) return null;
  const rows = await db()
    .select({
      id: schema.emailMessages.id,
      accountId: schema.emailMessages.accountId,
      accountAddress: schema.emailAccounts.address,
      direction: schema.emailMessages.direction,
      subject: schema.emailMessages.subject,
      bodyText: schema.emailMessages.bodyText,
      sentAt: schema.emailMessages.sentAt,
      fromAddress: schema.emailMessages.fromAddress,
      toAddress: schema.emailMessages.toAddress,
      leadId: schema.emailMessages.leadId,
    })
    .from(schema.emailMessages)
    .innerJoin(schema.emailAccounts, eq(schema.emailMessages.accountId, schema.emailAccounts.id))
    .where(and(eq(schema.emailMessages.userId, userId), eq(schema.emailMessages.counterparty, email)))
    .orderBy(asc(schema.emailMessages.sentAt))
    .limit(200);

  const leads = await leadsByEmail(userId);
  const lead = leads.get(email) ?? null;
  return {
    counterparty: email,
    lead: lead ? { id: lead.id, name: lead.name, status: lead.status } : null,
    messages: rows.map((row) => ({ ...row, sentAt: row.sentAt.toISOString() })),
  };
}
