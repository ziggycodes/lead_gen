import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

// Lead generation is unlimited. The usage table is a running counter kept for
// history and stats only - nothing in here can cap or block a search.
export interface UsageSnapshot {
  unlimited: true;
  consumedToday: number;
  totalConsumed: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Reset the daily counter if the stored day is in the past.
async function resetDailyIfNeeded(userId: number): Promise<void> {
  await db()
    .update(schema.usage)
    .set({ consumedToday: 0, dailyResetAt: todayStr() })
    .where(
      sql`${schema.usage.userId} = ${userId} AND (${schema.usage.dailyResetAt} IS NULL OR ${schema.usage.dailyResetAt} < ${todayStr()})`
    );
}

export async function getUsage(userId: number): Promise<UsageSnapshot> {
  await resetDailyIfNeeded(userId);
  const row = await db().query.usage.findFirst({
    where: eq(schema.usage.userId, userId),
  });
  return {
    unlimited: true,
    consumedToday: row?.consumedToday ?? 0,
    totalConsumed: row?.totalConsumed ?? 0,
  };
}

export async function recordUsage(userId: number, leads: number): Promise<void> {
  const consumed = Math.max(0, Math.floor(leads));
  if (consumed === 0) return;
  await db()
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
