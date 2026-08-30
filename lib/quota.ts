import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { DAILY_LEAD_CAP } from "./plans";

export interface QuotaSnapshot {
  balance: number;
  reserved: number;
  consumedToday: number;
  totalConsumed: number;
  dailyRemaining: number;
  available: number; // what a new search could use right now
}

export class QuotaExceededError extends Error {
  snapshot: QuotaSnapshot;
  constructor(snapshot: QuotaSnapshot) {
    super(
      snapshot.balance - snapshot.reserved <= 0
        ? "You've used all your leads. Buy a credit pack to keep going."
        : `Daily limit reached (${DAILY_LEAD_CAP} leads/day). Try again tomorrow.`
    );
    this.name = "QuotaExceededError";
    this.snapshot = snapshot;
  }
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

export async function getQuota(userId: number): Promise<QuotaSnapshot> {
  await resetDailyIfNeeded(userId);
  const row = await db().query.usage.findFirst({
    where: eq(schema.usage.userId, userId),
  });
  if (!row) throw new Error("Usage row missing.");
  const dailyRemaining = Math.max(0, DAILY_LEAD_CAP - row.consumedToday);
  const balanceFree = Math.max(0, row.balance - row.reserved);
  return {
    balance: row.balance,
    reserved: row.reserved,
    consumedToday: row.consumedToday,
    totalConsumed: row.totalConsumed,
    dailyRemaining,
    available: Math.min(balanceFree, dailyRemaining),
  };
}

// Reserve-then-reconcile: atomically reserve up to `requested` leads.
// Returns the number actually reserved (capped by balance + daily cap).
export async function reserveQuota(userId: number, requested: number): Promise<number> {
  const snapshot = await getQuota(userId);
  const allowed = Math.min(Math.max(0, requested), snapshot.available);
  if (allowed <= 0) throw new QuotaExceededError(snapshot);

  // Guard the same conditions inside the UPDATE so concurrent requests can't overspend.
  const result = await db()
    .update(schema.usage)
    .set({
      reserved: sql`${schema.usage.reserved} + ${allowed}`,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${schema.usage.userId} = ${userId}
        AND ${schema.usage.balance} - ${schema.usage.reserved} >= ${allowed}
        AND ${schema.usage.consumedToday} + ${schema.usage.reserved} + ${allowed} <= ${DAILY_LEAD_CAP}`
    )
    .returning({ userId: schema.usage.userId });

  if (result.length === 0) throw new QuotaExceededError(snapshot);
  return allowed;
}

// Release the reservation and consume what was actually used.
export async function reconcileQuota(
  userId: number,
  reservedAmount: number,
  actualLeads: number
): Promise<void> {
  const consume = Math.min(Math.max(0, actualLeads), reservedAmount);
  await db()
    .update(schema.usage)
    .set({
      reserved: sql`GREATEST(${schema.usage.reserved} - ${reservedAmount}, 0)`,
      balance: sql`GREATEST(${schema.usage.balance} - ${consume}, 0)`,
      consumedToday: sql`${schema.usage.consumedToday} + ${consume}`,
      totalConsumed: sql`${schema.usage.totalConsumed} + ${consume}`,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.usage.userId, userId));
}

// Release a reservation without consuming anything (failed/aborted before any leads).
export async function releaseQuota(userId: number, reservedAmount: number): Promise<void> {
  await reconcileQuota(userId, reservedAmount, 0);
}

export async function addCredits(userId: number, credits: number): Promise<void> {
  await db()
    .update(schema.usage)
    .set({
      balance: sql`${schema.usage.balance} + ${credits}`,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.usage.userId, userId));
}
