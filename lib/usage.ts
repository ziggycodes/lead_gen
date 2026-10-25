import { eq, sql } from "drizzle-orm";
import { db, schema, type Executor } from "./db";

// Regular accounts stop at 20 businesses a day, counted in consumedToday.
// Contact emails found in a search are capped only when an admin has set
// `users.email_daily_limit`. Premium accounts are not on the automatic 20.
export interface UsageSnapshot {
  unlimited: true;
  consumedToday: number;
  totalConsumed: number;
  emailsFoundToday: number;
  emailDailyLimit: number | null;
}

export interface EmailAllowance {
  foundToday: number;
  limit: number | null;
  // Null when the account has no daily cap.
  remaining: number | null;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Reset the daily counter if the stored day is in the past.
async function resetDailyIfNeeded(userId: number, dbx: Executor = db()): Promise<void> {
  await dbx
    .update(schema.usage)
    .set({ consumedToday: 0, dailyResetAt: todayStr() })
    .where(
      sql`${schema.usage.userId} = ${userId} AND (${schema.usage.dailyResetAt} IS NULL OR ${schema.usage.dailyResetAt} < ${todayStr()})`
    );
}

// Count in SQL. A date column comes back as a local Date, and toISOString()
// would move it to the previous UTC day for anyone ahead of UTC.
async function emailsFoundToday(userId: number, dbx: Executor = db()): Promise<number> {
  const today = todayStr();
  const [row] = await dbx
    .select({
      found: sql<number>`case when ${schema.usage.emailsFoundOn} is null or ${schema.usage.emailsFoundOn} < ${today} then 0 else ${schema.usage.emailsFoundToday} end`,
    })
    .from(schema.usage)
    .where(eq(schema.usage.userId, userId));
  return Number(row?.found) || 0;
}

export async function getUsage(userId: number, dbx: Executor = db()): Promise<UsageSnapshot> {
  await resetDailyIfNeeded(userId, dbx);
  const [row, user, emailsFound] = await Promise.all([
    dbx.query.usage.findFirst({
      where: eq(schema.usage.userId, userId),
    }),
    dbx.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { emailDailyLimit: true },
    }),
    emailsFoundToday(userId, dbx),
  ]);
  return {
    unlimited: true,
    consumedToday: row?.consumedToday ?? 0,
    totalConsumed: row?.totalConsumed ?? 0,
    emailsFoundToday: emailsFound,
    emailDailyLimit: user?.emailDailyLimit ?? null,
  };
}

export async function emailAllowance(
  userId: number,
  limit: number | null,
  dbx: Executor = db()
): Promise<EmailAllowance> {
  const foundToday = await emailsFoundToday(userId, dbx);
  return {
    foundToday,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - foundToday),
  };
}

// Adds emails found in one search. A new UTC day replaces the counter instead
// of stacking on yesterday's total.
export async function recordEmailsFound(userId: number, emails: number, dbx: Executor = db()): Promise<void> {
  const found = Math.max(0, Math.floor(emails));
  if (found === 0) return;
  const today = todayStr();
  await dbx
    .update(schema.usage)
    .set({
      emailsFoundToday: sql`case when ${schema.usage.emailsFoundOn} is null or ${schema.usage.emailsFoundOn} < ${today} then ${found} else ${schema.usage.emailsFoundToday} + ${found} end`,
      emailsFoundOn: today,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.usage.userId, userId));
}

export async function recordUsage(userId: number, leads: number, dbx: Executor = db()): Promise<void> {
  const consumed = Math.max(0, Math.floor(leads));
  if (consumed === 0) return;
  await dbx
    .update(schema.usage)
    .set({
      consumedToday: sql`${schema.usage.consumedToday} + ${consumed}`,
      totalConsumed: sql`${schema.usage.totalConsumed} + ${consumed}`,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.usage.userId, userId));
}

// Credit packs no longer gate anything, but purchases are still recorded so the
// billing history and Paystack reconciliation stay intact.
export async function addCredits(userId: number, credits: number): Promise<void> {
  await db()
    .update(schema.usage)
    .set({
      balance: sql`${schema.usage.balance} + ${credits}`,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.usage.userId, userId));
}
