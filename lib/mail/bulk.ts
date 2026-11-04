import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ownedAccount, sentTodayByAccount } from "./accounts";
import {
  BULK_SKIP_STATUSES,
  MAX_SEND_ATTEMPTS,
  missingLabel,
  planRecipients,
  retryDelaySeconds,
  statusSkipLabel,
  UNSUBSCRIBED_LABEL,
} from "./bulkRules";
import { MailboxAuthError, SendLimitError, TemporarySendError, logMailEvent, logMailFailure } from "./errors";
import { renderTemplate } from "./merge";
import { sendFromMailbox } from "./send";
import { ownedTemplate } from "./templates";
import { normalizeEmail } from "./text";
import { isSuppressed, suppressedEmails } from "./unsubscribe";
import { inSendWindow, nextWindowStart, sendGapSeconds, warmupStatus } from "./warmup";

export const MAX_BULK_RECIPIENTS = 200;

// Per mailbox: a warming mailbox can take weeks to finish a batch, and that
// shouldn't hold up the user's other mailboxes.
export async function hasActiveBulkSend(userId: number, accountId: number) {
  const row = await db().query.bulkSends.findFirst({
    where: and(
      eq(schema.bulkSends.userId, userId),
      eq(schema.bulkSends.accountId, accountId),
      inArray(schema.bulkSends.status, ["queued", "running"])
    ),
  });
  return row ?? null;
}

export async function createBulkSend(
  userId: number,
  input: { accountId: number; templateId: number; leadIds: number[] }
) {
  const account = await ownedAccount(userId, input.accountId);
  if (!account || account.status !== "connected") throw new MailboxAuthError("Choose a connected mailbox.");
  const template = await ownedTemplate(userId, input.templateId);
  if (!template) throw new MailboxAuthError("Template not found.");
  if (await hasActiveBulkSend(userId, account.id)) {
    throw new MailboxAuthError("This mailbox already has a bulk send running. Wait for it to finish or cancel it.");
  }

  const leads = await db().query.leads.findMany({
    where: and(eq(schema.leads.userId, userId), inArray(schema.leads.id, input.leadIds)),
  });
  if (!leads.length) throw new MailboxAuthError("None of those leads were found.");

  const suppressed = await suppressedEmails(userId, leads.map((lead) => lead.email));
  const plan = planRecipients(leads, template, suppressed);
  const recipients = [
    ...plan.send.map((lead) => ({ leadId: lead.id, email: normalizeEmail(lead.email), status: "pending", reason: null })),
    ...plan.skip.map(({ lead, reason }) => ({ leadId: lead.id, email: normalizeEmail(lead.email), status: "skipped", reason })),
  ];
  const skipped = plan.skip.length;
  const pending = plan.send.length;

  const [send] = await db()
    .insert(schema.bulkSends)
    .values({
      userId,
      accountId: account.id,
      templateId: template.id,
      subject: template.subject,
      body: template.body,
      status: pending ? "queued" : "completed",
      total: recipients.length,
      skipped,
      completedAt: pending ? null : new Date(),
    })
    .returning();
  await db()
    .insert(schema.bulkSendRecipients)
    .values(recipients.map((r) => ({ ...r, bulkSendId: send.id })));

  logMailEvent("bulk_send_created", { userId, bulkSendId: send.id, pending, skipped });
  return send;
}

async function finishSend(bulkSendId: number, status: "completed" | "cancelled") {
  await db()
    .update(schema.bulkSends)
    .set({ status, completedAt: new Date() })
    .where(eq(schema.bulkSends.id, bulkSendId));
}

export type SendStep = { done: boolean; rateLimited?: boolean; resumeAt?: string; waitSeconds?: number };

// Null when the mailbox can send now, otherwise when it next can.
function pausedUntil(account: typeof schema.emailAccounts.$inferSelect, sentToday: number, now: Date) {
  if (!inSendWindow(now, account.timezone)) return nextWindowStart(now, account.timezone);
  if (warmupStatus(account, sentToday, now).remainingToday <= 0) return nextWindowStart(now, account.timezone);
  return null;
}

// Sends the next pending recipient. Each call is one Inngest step, so it must
// never send twice: a row is marked "sending" first, and a retry that finds a
// "sending" row records it as failed instead of sending again.
export async function sendNextRecipient(bulkSendId: number): Promise<SendStep> {
  const send = await db().query.bulkSends.findFirst({ where: eq(schema.bulkSends.id, bulkSendId) });
  if (!send || send.status === "completed" || send.status === "cancelled") return { done: true };

  if (send.cancelRequested) {
    const cancelled = await db()
      .update(schema.bulkSendRecipients)
      .set({ status: "skipped", reason: "Cancelled" })
      .where(
        and(
          eq(schema.bulkSendRecipients.bulkSendId, bulkSendId),
          inArray(schema.bulkSendRecipients.status, ["pending", "sending"])
        )
      )
      .returning({ id: schema.bulkSendRecipients.id });
    await db()
      .update(schema.bulkSends)
      .set({ skipped: sql`${schema.bulkSends.skipped} + ${cancelled.length}` })
      .where(eq(schema.bulkSends.id, bulkSendId));
    await finishSend(bulkSendId, "cancelled");
    return { done: true };
  }

  if (send.status === "queued") {
    await db().update(schema.bulkSends).set({ status: "running" }).where(eq(schema.bulkSends.id, bulkSendId));
  }

  const interrupted = await db()
    .update(schema.bulkSendRecipients)
    .set({ status: "failed", reason: "Send was interrupted; not retried to avoid a duplicate" })
    .where(and(eq(schema.bulkSendRecipients.bulkSendId, bulkSendId), eq(schema.bulkSendRecipients.status, "sending")))
    .returning({ id: schema.bulkSendRecipients.id });
  if (interrupted.length) {
    await db()
      .update(schema.bulkSends)
      .set({ failed: sql`${schema.bulkSends.failed} + ${interrupted.length}` })
      .where(eq(schema.bulkSends.id, bulkSendId));
  }

  const next = await db().query.bulkSendRecipients.findFirst({
    where: and(eq(schema.bulkSendRecipients.bulkSendId, bulkSendId), eq(schema.bulkSendRecipients.status, "pending")),
    orderBy: [asc(schema.bulkSendRecipients.id)],
  });
  if (!next) {
    await finishSend(bulkSendId, "completed");
    return { done: true };
  }

  const markSkipped = async (reason: string) => {
    await db().update(schema.bulkSendRecipients).set({ status: "skipped", reason }).where(eq(schema.bulkSendRecipients.id, next.id));
    await db()
      .update(schema.bulkSends)
      .set({ skipped: sql`${schema.bulkSends.skipped} + 1` })
      .where(eq(schema.bulkSends.id, bulkSendId));
  };

  // Re-check the lead now: it may have replied, been deleted, or lost its AI draft since the batch was queued.
  const lead = next.leadId
    ? await db().query.leads.findFirst({
        where: and(eq(schema.leads.id, next.leadId), eq(schema.leads.userId, send.userId)),
      })
    : null;
  if (!lead) {
    await markSkipped("Lead was deleted");
    return { done: false };
  }
  if (await isSuppressed(send.userId, next.email)) {
    await markSkipped(UNSUBSCRIBED_LABEL);
    return { done: false };
  }
  if (lead.status === "replied" || BULK_SKIP_STATUSES.has(lead.status)) {
    await markSkipped(statusSkipLabel(lead.status));
    return { done: false };
  }
  const rendered = renderTemplate(send, lead);
  if (rendered.missing.length) {
    await markSkipped(missingLabel(rendered.missing));
    return { done: false };
  }

  const account = await ownedAccount(send.userId, send.accountId);
  if (!account) return { done: true };
  const now = new Date();
  const sentToday = (await sentTodayByAccount(send.userId, account.id)).get(account.id) ?? 0;
  const resumeAt = pausedUntil(account, sentToday, now);
  if (resumeAt) {
    await db().update(schema.bulkSends).set({ resumeAt }).where(eq(schema.bulkSends.id, bulkSendId));
    logMailEvent("bulk_send_paused", { bulkSendId, accountId: account.id, sentToday });
    return { done: false, resumeAt: resumeAt.toISOString() };
  }
  if (send.resumeAt) {
    await db().update(schema.bulkSends).set({ resumeAt: null }).where(eq(schema.bulkSends.id, bulkSendId));
  }

  await db().update(schema.bulkSendRecipients).set({ status: "sending" }).where(eq(schema.bulkSendRecipients.id, next.id));
  try {
    await sendFromMailbox(send.userId, {
      accountId: send.accountId,
      to: next.email,
      subject: rendered.subject,
      body: rendered.body,
      leadId: lead.id,
      bulk: true,
    });
  } catch (err) {
    if (err instanceof SendLimitError) {
      await db().update(schema.bulkSendRecipients).set({ status: "pending" }).where(eq(schema.bulkSendRecipients.id, next.id));
      return { done: false, rateLimited: true };
    }
    const attempts = next.attempts + 1;
    if (err instanceof TemporarySendError && attempts < MAX_SEND_ATTEMPTS) {
      await db().update(schema.bulkSendRecipients).set({ status: "pending", attempts }).where(eq(schema.bulkSendRecipients.id, next.id));
      logMailEvent("bulk_send_retry_scheduled", { bulkSendId, leadId: lead.id, attempts });
      return { done: false, waitSeconds: retryDelaySeconds(attempts) };
    }
    logMailFailure("bulk_send_recipient_failed", err, { bulkSendId, leadId: lead.id });
    const reason = err instanceof MailboxAuthError ? err.message : "The mail server rejected this send.";
    await db().update(schema.bulkSendRecipients).set({ status: "failed", reason }).where(eq(schema.bulkSendRecipients.id, next.id));
    await db()
      .update(schema.bulkSends)
      .set({ failed: sql`${schema.bulkSends.failed} + 1` })
      .where(eq(schema.bulkSends.id, bulkSendId));
    return { done: false };
  }

  await db()
    .update(schema.bulkSendRecipients)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(schema.bulkSendRecipients.id, next.id));
  await db()
    .update(schema.bulkSends)
    .set({ sent: sql`${schema.bulkSends.sent} + 1` })
    .where(eq(schema.bulkSends.id, bulkSendId));

  const leftInBatch = send.total - send.sent - send.skipped - send.failed - 1;
  const leftToday = warmupStatus(account, sentToday + 1, now).remainingToday;
  return { done: false, waitSeconds: sendGapSeconds(new Date(), account.timezone, Math.min(leftInBatch, leftToday)) };
}

export async function markBulkSendFailed(bulkSendId: number) {
  await db()
    .update(schema.bulkSends)
    .set({ status: "failed", completedAt: new Date() })
    .where(and(eq(schema.bulkSends.id, bulkSendId), inArray(schema.bulkSends.status, ["queued", "running"])));
}

export function listBulkSends(userId: number) {
  return db().query.bulkSends.findMany({
    where: eq(schema.bulkSends.userId, userId),
    orderBy: [desc(schema.bulkSends.createdAt)],
    limit: 10,
  });
}

export async function bulkSendDetail(userId: number, id: number) {
  const send = await db().query.bulkSends.findFirst({
    where: and(eq(schema.bulkSends.id, id), eq(schema.bulkSends.userId, userId)),
  });
  if (!send) return null;
  const recipients = await db()
    .select({
      id: schema.bulkSendRecipients.id,
      leadId: schema.bulkSendRecipients.leadId,
      email: schema.bulkSendRecipients.email,
      status: schema.bulkSendRecipients.status,
      reason: schema.bulkSendRecipients.reason,
      sentAt: schema.bulkSendRecipients.sentAt,
      leadName: schema.leads.name,
    })
    .from(schema.bulkSendRecipients)
    .leftJoin(schema.leads, eq(schema.leads.id, schema.bulkSendRecipients.leadId))
    .where(eq(schema.bulkSendRecipients.bulkSendId, id))
    .orderBy(asc(schema.bulkSendRecipients.id));
  return { send, recipients };
}

// Cancels at once: pending rows are skipped now, and the job's next step sees
// the flag and stops. A row already mid-send is left to finish.
export async function requestBulkCancel(userId: number, id: number) {
  const [row] = await db()
    .update(schema.bulkSends)
    .set({ cancelRequested: true })
    .where(
      and(
        eq(schema.bulkSends.id, id),
        eq(schema.bulkSends.userId, userId),
        inArray(schema.bulkSends.status, ["queued", "running"])
      )
    )
    .returning();
  if (!row) return null;
  const cancelled = await db()
    .update(schema.bulkSendRecipients)
    .set({ status: "skipped", reason: "Cancelled" })
    .where(and(eq(schema.bulkSendRecipients.bulkSendId, id), eq(schema.bulkSendRecipients.status, "pending")))
    .returning({ id: schema.bulkSendRecipients.id });
  const [updated] = await db()
    .update(schema.bulkSends)
    .set({ skipped: sql`${schema.bulkSends.skipped} + ${cancelled.length}`, status: "cancelled", completedAt: new Date() })
    .where(eq(schema.bulkSends.id, id))
    .returning();
  return updated;
}
