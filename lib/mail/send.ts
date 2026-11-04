import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ownedAccount } from "./accounts";
import { decryptSecret } from "./crypto";
import { MailboxAuthError, SendLimitError, logMailEvent } from "./errors";
import { noteEmailSent } from "./pipeline";
import { sendSmtp } from "./smtp";
import { isEmailAddress, normalizeEmail, normalizeMessageId } from "./text";
import { isSuppressed } from "./unsubscribe";
import { unsubscribeFooter, unsubscribeHeaders, unsubscribeUrls } from "./unsubscribeToken";

const SENDS_PER_HOUR = 30;

async function assertSendAllowance(userId: number, accountId: number) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db()
    .select({ n: count() })
    .from(schema.emailMessages)
    .where(
      and(
        eq(schema.emailMessages.userId, userId),
        eq(schema.emailMessages.accountId, accountId),
        eq(schema.emailMessages.direction, "outbound"),
        gte(schema.emailMessages.sentAt, since)
      )
    );
  if ((row?.n ?? 0) >= SENDS_PER_HOUR) throw new SendLimitError();
}

async function leadForSend(userId: number, leadId: number | null, to: string) {
  if (leadId) {
    const lead = await db().query.leads.findFirst({
      where: and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)),
    });
    if (!lead) throw new MailboxAuthError("Lead not found.");
    return lead;
  }
  const match = await db().query.leads.findFirst({
    where: and(eq(schema.leads.userId, userId), sql`lower(${schema.leads.email}) = ${to}`),
    orderBy: [desc(schema.leads.lastActivityAt)],
  });
  return match ?? null;
}

export async function sendFromMailbox(
  userId: number,
  input: { accountId: number; to: string; subject: string; body: string; leadId?: number | null; bulk?: boolean }
) {
  const to = normalizeEmail(input.to);
  const subject = input.subject.trim().slice(0, 200);
  const written = input.body.trim().slice(0, 20_000);
  if (!isEmailAddress(to)) throw new MailboxAuthError("Enter a valid recipient address.");
  if (!subject) throw new MailboxAuthError("Add a subject.");
  if (!written) throw new MailboxAuthError("Write a message before sending.");

  const account = await ownedAccount(userId, input.accountId);
  if (!account || account.status !== "connected") throw new MailboxAuthError("Choose a connected mailbox.");
  if (await isSuppressed(userId, to)) {
    throw new MailboxAuthError("This person unsubscribed from your emails, so LeadScout won't send to them.");
  }
  await assertSendAllowance(userId, account.id);

  const lead = await leadForSend(userId, input.leadId ?? null, to);
  const password = decryptSecret(account.secretCiphertext);
  const links = input.bulk ? unsubscribeUrls(userId, to) : null;
  const body = links ? written + unsubscribeFooter(links.page) : written;
  const headers = links ? unsubscribeHeaders(links.oneClick) : undefined;
  const rawId = await sendSmtp({ target: account, password, to, subject, text: body, headers });
  const messageId = normalizeMessageId(rawId) || `local-${account.id}-${Date.now()}`;
  const sentAt = new Date();

  const [saved] = await db()
    .insert(schema.emailMessages)
    .values({
      userId,
      accountId: account.id,
      leadId: lead?.id ?? null,
      direction: "outbound",
      messageId,
      counterparty: to,
      fromAddress: account.address,
      toAddress: to,
      subject,
      bodyText: body,
      sentAt,
    })
    .onConflictDoNothing({
      target: [schema.emailMessages.accountId, schema.emailMessages.messageId],
    })
    .returning();

  if (lead) await noteEmailSent(userId, lead, to);
  logMailEvent("mail_sent", { userId, accountId: account.id, leadId: lead?.id ?? null });

  return {
    id: saved?.id ?? null,
    accountId: account.id,
    accountAddress: account.address,
    direction: "outbound" as const,
    counterparty: to,
    fromAddress: account.address,
    toAddress: to,
    subject,
    bodyText: body,
    sentAt: sentAt.toISOString(),
    leadId: lead?.id ?? null,
  };
}
