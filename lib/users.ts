import { eq } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db, schema } from "./db";
import { FREE_TRIAL_LEADS } from "./plans";

export interface AppUser {
  id: number;
  clerkId: string;
  email: string | null;
  plan: string;
}

// Lazily provision the user + usage rows on first authenticated request,
// so no Clerk webhook setup is needed for v0.
export async function ensureUser(): Promise<AppUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new UnauthorizedError();

  const existing = await db().query.users.findFirst({
    where: eq(schema.users.clerkId, clerkId),
  });
  if (existing) return existing;

  const cu = await currentUser();
  const email = cu?.primaryEmailAddress?.emailAddress ?? null;

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

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}
