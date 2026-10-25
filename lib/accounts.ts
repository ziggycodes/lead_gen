import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isAdminEmail } from "./access";
import { recordAdminAction } from "./adminAudit";
import { db, schema } from "./db";
import type { AccountStatus } from "./users";

const NOTE_MAX = 500;
const LIMIT_MAX = 100_000;

const ACTIONS = ["set_limit", "flag", "unflag", "restrict", "unrestrict", "grant_premium", "revoke_premium"] as const;
export type AccountAction = (typeof ACTIONS)[number];

export interface AdminAccount {
  id: number;
  email: string | null;
  name: string | null;
  country: string | null;
  plan: "free" | "premium";
  createdAt: string;
  accountStatus: AccountStatus;
  accountNote: string | null;
  emailDailyLimit: number | null;
  emailsFoundToday: number;
  leadCount: number;
  leadsWithEmail: number;
  totalConsumed: number;
  hasMailbox: boolean;
  isAdmin: boolean;
  balance: number;
  lastSearchAt: string | null;
}

export interface AccountNotice {
  id: number;
  kind: string;
  body: string;
  createdAt: Date;
}

export class AccountActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AccountActionError";
    this.status = status;
  }
}

function asStatus(value: string): AccountStatus {
  if (value === "flagged" || value === "restricted") return value;
  return "active";
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function cleanNote(value: unknown): string {
  if (typeof value !== "string") {
    throw new AccountActionError("Write a note. They will see it.");
  }
  const note = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!note) throw new AccountActionError("Write a note. They will see it.");
  if (note.length > NOTE_MAX) {
    throw new AccountActionError("Keep the note to 500 characters or fewer.");
  }
  return note;
}

function parseLimit(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new AccountActionError(
        "Enter a whole number from 0 to 100000, or leave the limit empty for unlimited."
      );
    }
    value = Number(trimmed);
  }
  const raw = typeof value === "number" ? value : NaN;
  if (!Number.isInteger(raw) || raw < 0 || raw > LIMIT_MAX) {
    throw new AccountActionError(
      "Enter a whole number from 0 to 100000, or leave the limit empty for unlimited."
    );
  }
  return raw;
}

function toAccount(row: {
  id: number;
  email: string | null;
  name: string | null;
  country: string | null;
  plan: string;
  createdAt: Date | string;
  accountStatus: string;
  accountNote: string | null;
  emailDailyLimit: number | null;
  emailsFoundToday: unknown;
  leadCount: unknown;
  leadsWithEmail: unknown;
  totalConsumed: unknown;
  hasMailbox: unknown;
  balance: unknown;
  lastSearchAt: Date | string | null;
}): AdminAccount {
  const created =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? "");
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    country: row.country,
    plan: row.plan === "premium" ? "premium" : "free",
    createdAt: created,
    accountStatus: asStatus(row.accountStatus),
    accountNote: row.accountNote,
    emailDailyLimit: row.emailDailyLimit,
    emailsFoundToday: Number(row.emailsFoundToday) || 0,
    leadCount: Number(row.leadCount) || 0,
    leadsWithEmail: Number(row.leadsWithEmail) || 0,
    totalConsumed: Number(row.totalConsumed) || 0,
    hasMailbox: row.hasMailbox === true || row.hasMailbox === "t",
    isAdmin: isAdminEmail(row.email),
    balance: Number(row.balance) || 0,
    lastSearchAt: row.lastSearchAt ? new Date(row.lastSearchAt).toISOString() : null,
  };
}

function accountQuery() {
  const today = todayStr();
  return db()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      country: schema.users.country,
      plan: schema.users.plan,
      createdAt: schema.users.createdAt,
      accountStatus: schema.users.accountStatus,
      accountNote: schema.users.accountNote,
      emailDailyLimit: schema.users.emailDailyLimit,
      emailsFoundToday: sql<number>`case when ${schema.usage.emailsFoundOn} is null or ${schema.usage.emailsFoundOn} < ${today} then 0 else coalesce(${schema.usage.emailsFoundToday}, 0) end`,
      totalConsumed: sql<number>`coalesce(${schema.usage.totalConsumed}, 0)`,
      leadCount: sql<number>`(select count(*)::int from ${schema.leads} where ${schema.leads.userId} = ${schema.users.id})`,
      leadsWithEmail: sql<number>`(select count(*)::int from ${schema.leads} where ${schema.leads.userId} = ${schema.users.id} and btrim(${schema.leads.email}) <> '')`,
      hasMailbox: sql<boolean>`exists (select 1 from ${schema.emailAccounts} where ${schema.emailAccounts.userId} = ${schema.users.id})`,
      balance: sql<number>`coalesce(${schema.usage.balance}, 0)`,
      lastSearchAt: sql<string | null>`(select max(${schema.searches.createdAt}) from ${schema.searches} where ${schema.searches.userId} = ${schema.users.id})`,
    })
    .from(schema.users)
    .leftJoin(schema.usage, eq(schema.usage.userId, schema.users.id));
}

export async function listAccounts(): Promise<AdminAccount[]> {
  const rows = await accountQuery().orderBy(desc(schema.users.createdAt));
  return rows.map(toAccount);
}

async function loadAccount(userId: number): Promise<AdminAccount | null> {
  const [row] = await accountQuery().where(eq(schema.users.id, userId)).limit(1);
  return row ? toAccount(row) : null;
}

function noticeFor(
  action: AccountAction,
  note: string | null,
  limit: number | null
): { kind: string; body: string } | null {
  if (action === "set_limit") {
    return limit == null
      ? { kind: "email_limit", body: "Your daily contact-email limit was removed." }
      : { kind: "email_limit", body: `Your daily contact-email limit is now ${limit}.` };
  }
  if (action === "flag") {
    return { kind: "flagged", body: `New searches are paused. Reason: ${note}` };
  }
  if (action === "unflag") {
    return { kind: "unflagged", body: "The flag on your account was removed. You can search again." };
  }
  if (action === "restrict") {
    return { kind: "restricted", body: `Your account is locked. Reason: ${note}` };
  }
  if (action === "unrestrict") {
    return { kind: "unrestricted", body: "Your account was restored." };
  }
  if (action === "grant_premium") {
    return { kind: "premium", body: "You can now choose niches and states." };
  }
  if (action === "revoke_premium") {
    return { kind: "premium", body: "Niche and state choices were turned off." };
  }
  return null;
}

export async function loadAccountById(userId: number): Promise<AdminAccount | null> {
  return loadAccount(userId);
}

function auditDetail(
  action: AccountAction,
  target: { plan: string; emailDailyLimit: number | null; accountStatus: string },
  note: string | null,
  limit: number | null
): Record<string, unknown> {
  if (action === "set_limit") return { from: target.emailDailyLimit, to: limit };
  if (action === "grant_premium" || action === "revoke_premium") {
    return { from: target.plan, to: action === "grant_premium" ? "premium" : "free" };
  }
  return { from: target.accountStatus, note };
}

export async function applyAccountAction(input: {
  adminEmail: string;
  userId: number;
  action: string;
  emailDailyLimit?: unknown;
  note?: unknown;
}): Promise<AdminAccount> {
  if (!ACTIONS.includes(input.action as AccountAction)) {
    throw new AccountActionError("Choose an action.");
  }
  const action = input.action as AccountAction;
  const target = await db().query.users.findFirst({
    where: eq(schema.users.id, input.userId),
  });
  if (!target) throw new AccountActionError("That account doesn't exist.", 404);

  if (
    isAdminEmail(target.email) &&
    (action === "flag" || action === "unflag" || action === "restrict" || action === "unrestrict")
  ) {
    throw new AccountActionError("Admin accounts can't be flagged or restricted.");
  }

  const status = asStatus(target.accountStatus);
  const note = action === "flag" || action === "restrict" ? cleanNote(input.note) : null;

  if (action === "unflag") {
    if (status === "restricted") {
      throw new AccountActionError("Lift the restriction before clearing a flag.");
    }
    if (status !== "flagged") throw new AccountActionError("That account is not flagged.");
  }
  if (action === "unrestrict" && status !== "restricted") {
    throw new AccountActionError("That account is not restricted.");
  }
  if (action === "flag" && status === "restricted") {
    throw new AccountActionError("Lift the restriction before flagging this account.");
  }

  let limit: number | null = null;
  const patch: {
    accountStatus?: AccountStatus;
    accountNote?: string | null;
    emailDailyLimit?: number | null;
    plan?: string;
  } = {};

  if (action === "set_limit") {
    limit = parseLimit(input.emailDailyLimit);
    if (limit === target.emailDailyLimit) {
      const current = await loadAccount(target.id);
      if (!current) throw new AccountActionError("That account doesn't exist.", 404);
      return current;
    }
    patch.emailDailyLimit = limit;
  } else if (action === "flag") {
    patch.accountStatus = "flagged";
    patch.accountNote = note;
  } else if (action === "unflag" || action === "unrestrict") {
    patch.accountStatus = "active";
    patch.accountNote = null;
  } else if (action === "restrict") {
    patch.accountStatus = "restricted";
    patch.accountNote = note;
  } else if (action === "grant_premium") {
    if (target.plan === "premium") {
      const current = await loadAccount(target.id);
      if (!current) throw new AccountActionError("That account doesn't exist.", 404);
      return current;
    }
    patch.plan = "premium";
  } else if (action === "revoke_premium") {
    if (target.plan !== "premium") {
      const current = await loadAccount(target.id);
      if (!current) throw new AccountActionError("That account doesn't exist.", 404);
      return current;
    }
    patch.plan = "free";
  }

  const notice = noticeFor(action, note, limit);
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set(patch).where(eq(schema.users.id, target.id));
    if (notice) {
      await tx.insert(schema.accountNotices).values({
        userId: target.id,
        kind: notice.kind,
        body: notice.body,
      });
    }
    await recordAdminAction(tx, {
      adminEmail: input.adminEmail,
      action,
      targetUserId: target.id,
      detail: auditDetail(action, target, note, limit),
    });
  });

  console.info(JSON.stringify({ event: "account_action", action, userId: target.id }));

  const updated = await loadAccount(target.id);
  if (!updated) throw new AccountActionError("That account doesn't exist.", 404);
  return updated;
}

export async function unreadNotices(userId: number): Promise<AccountNotice[]> {
  return db()
    .select({
      id: schema.accountNotices.id,
      kind: schema.accountNotices.kind,
      body: schema.accountNotices.body,
      createdAt: schema.accountNotices.createdAt,
    })
    .from(schema.accountNotices)
    .where(and(eq(schema.accountNotices.userId, userId), isNull(schema.accountNotices.readAt)))
    .orderBy(desc(schema.accountNotices.createdAt))
    .limit(20);
}

export async function markNoticesRead(userId: number, ids: number[]): Promise<void> {
  await db()
    .update(schema.accountNotices)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.accountNotices.userId, userId),
        inArray(schema.accountNotices.id, ids),
        isNull(schema.accountNotices.readAt)
      )
    );
}
