import { eq } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminEmail, isEmailAllowed, normalizeEmail } from "./access";
import { db, schema } from "./db";
import { FREE_TRIAL_LEADS } from "./plans";

export interface AppUser {
  id: number;
  clerkId: string;
  email: string | null;
  plan: string;
}

async function liveEmail(): Promise<string | null> {
  const cu = await currentUser();
  const raw = cu?.primaryEmailAddress?.emailAddress?.trim() || null;
  return normalizeEmail(raw) ?? raw;
}

// Lazily provision the user + usage rows on first authenticated request,
// so no Clerk webhook setup is needed for v0.
// When ADMIN_EMAILS is set, the live Clerk email must be an admin or on the allowlist.
export async function ensureUser(): Promise<AppUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new UnauthorizedError();

  const email = await liveEmail();
  if (!(await isEmailAllowed(email))) throw new ForbiddenError();

  const existing = await db().query.users.findFirst({
    where: eq(schema.users.clerkId, clerkId),
  });
  if (existing) {
    if (email && existing.email !== email) {
      const [updated] = await db()
        .update(schema.users)
        .set({ email })
        .where(eq(schema.users.id, existing.id))
        .returning();
      if (updated) return updated;
    }
    return existing;
  }

  const [user] = await db()
    .insert(schema.users)
    .values({ clerkId, email })
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

  return row;
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
