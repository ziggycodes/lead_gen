import { and, asc, eq, ne, sql } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminEmail, isEmailAllowed, normalizeEmail } from "./access";
import { db, schema } from "./db";
import { FREE_TRIAL_LEADS } from "./plans";

export type AccountStatus = "active" | "flagged" | "restricted";

export interface AppUser {
  id: number;
  clerkId: string;
  email: string | null;
  name: string | null;
  plan: string;
  accountStatus: AccountStatus;
  accountNote: string | null;
  emailDailyLimit: number | null;
}

export function isPremiumPlan(plan: string | null | undefined): boolean {
  return plan === "premium";
}

function asStatus(value: string): AccountStatus {
  if (value === "flagged" || value === "restricted") return value;
  return "active";
}

function toAppUser(row: {
  id: number;
  clerkId: string;
  email: string | null;
  name: string | null;
  plan: string;
  accountStatus: string;
  accountNote: string | null;
  emailDailyLimit: number | null;
}): AppUser {
  return {
    id: row.id,
    clerkId: row.clerkId,
    email: row.email,
    name: row.name,
    plan: row.plan,
    accountStatus: asStatus(row.accountStatus),
    accountNote: row.accountNote,
    emailDailyLimit: row.emailDailyLimit,
  };
}

async function liveProfile(): Promise<{ email: string | null; name: string | null; emailVerified: boolean }> {
  const cu = await currentUser();
  const raw = cu?.primaryEmailAddress?.emailAddress?.trim() || null;
  const email = normalizeEmail(raw) ?? raw;
  const name = [cu?.firstName, cu?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 120);
  const emailVerified = cu?.primaryEmailAddress?.verification?.status === "verified";
  return { email, name: name || null, emailVerified };
}

// A new Clerk instance (development -> production) gives everyone a new Clerk
// user id. Move their existing account to it by verified email, so their leads,
// searches, and mailboxes stay theirs. Clerk allows one account per email in an
// instance, so a different clerk_id with the same verified email is the same person.
async function relinkByEmail(clerkId: string, email: string, name: string | null) {
  const match = await db().query.users.findFirst({
    where: and(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`, ne(schema.users.clerkId, clerkId)),
    orderBy: [asc(schema.users.id)],
    columns: { id: true },
  });
  if (!match) return null;
  const [relinked] = await db()
    .update(schema.users)
    .set({ clerkId, ...(name ? { name } : {}) })
    // A concurrent first request may have relinked it already; then this matches nothing.
    .where(and(eq(schema.users.id, match.id), ne(schema.users.clerkId, clerkId)))
    .returning();
  if (relinked) console.info(JSON.stringify({ event: "user_relinked", userId: relinked.id }));
  return relinked ?? null;
}

async function liveEmail(): Promise<string | null> {
  return (await liveProfile()).email;
}

// Lazily provision the user + usage rows on first authenticated request,
// so no Clerk webhook setup is needed for v0.
// When ADMIN_EMAILS is set, the live Clerk email must be an admin or on the allowlist.
// Does not reject a restricted account. The lockout page uses this so the person
// can still read why they are locked out.
export async function readUser(): Promise<AppUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new UnauthorizedError();

  const { email, name, emailVerified } = await liveProfile();
  if (!(await isEmailAllowed(email))) throw new ForbiddenError();

  const existing = await db().query.users.findFirst({
    where: eq(schema.users.clerkId, clerkId),
  });
  if (existing) {
    const patch: { email?: string; name?: string | null } = {};
    if (email && existing.email !== email) patch.email = email;
    if ((existing.name || null) !== name) patch.name = name;
    if (Object.keys(patch).length) {
      const [updated] = await db()
        .update(schema.users)
        .set(patch)
        .where(eq(schema.users.id, existing.id))
        .returning();
      if (updated) return toAppUser(updated);
    }
    return toAppUser(existing);
  }

  if (email && emailVerified) {
    const relinked = await relinkByEmail(clerkId, email, name);
    if (relinked) return toAppUser(relinked);
  }

  const [user] = await db()
    .insert(schema.users)
    .values({ clerkId, email, name })
    .onConflictDoNothing({ target: schema.users.clerkId })
    .returning();

  // Row may already exist if two requests raced; re-read in that case.
  const row =
    user ??
    (await db().query.users.findFirst({ where: eq(schema.users.clerkId, clerkId) }));
  if (!row) throw new Error("Failed to provision user.");

  await db()
    .insert(schema.usage)
    .values({ userId: row.id, balance: FREE_TRIAL_LEADS })
    .onConflictDoNothing({ target: schema.usage.userId });

  return toAppUser(row);
}

export async function ensureUser(): Promise<AppUser> {
  const user = await readUser();
  if (user.accountStatus === "restricted") throw new RestrictedError(user.accountNote);
  return user;
}

export async function requireAdmin(): Promise<{ email: string }> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  const email = await liveEmail();
  if (!email || !isAdminEmail(email)) {
    throw new ForbiddenError("You can't manage who can sign in.");
  }
  return { email };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "This email is not allowed to use LeadScout") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class RestrictedError extends Error {
  constructor(note: string | null) {
    const reason = note?.trim();
    super(reason ? `Your account is locked. ${reason}` : "Your account is locked.");
    this.name = "RestrictedError";
  }
}
