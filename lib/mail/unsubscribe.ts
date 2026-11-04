import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logActivity } from "@/lib/leads";
import { logMailEvent } from "./errors";
import { normalizeEmail } from "./text";

// Stages an opt-out shouldn't overwrite: not_interested is already right, and
// won and lost record what happened with the deal.
const KEEP_STATUSES = ["not_interested", "won", "lost"];

export async function suppressedEmails(userId: number, emails: string[]) {
  const unique = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  if (!unique.length) return new Set<string>();
  const rows = await db()
    .select({ email: schema.emailSuppressions.email })
    .from(schema.emailSuppressions)
    .where(and(eq(schema.emailSuppressions.userId, userId), inArray(schema.emailSuppressions.email, unique)));
  return new Set(rows.map((row) => row.email));
}

export async function isSuppressed(userId: number, email: string) {
  return (await suppressedEmails(userId, [email])).size > 0;
}

// Safe to repeat: mail apps and people can both hit this more than once.
export async function recordUnsubscribe(userId: number, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  await db().insert(schema.emailSuppressions).values({ userId, email }).onConflictDoNothing();

  const leads = await db()
    .update(schema.leads)
    .set({ status: "not_interested", updatedAt: new Date() })
    .where(
      and(
        eq(schema.leads.userId, userId),
        sql`lower(${schema.leads.email}) = ${email}`,
        notInArray(schema.leads.status, KEEP_STATUSES)
      )
    )
    .returning({ id: schema.leads.id });
  await logActivity(userId, leads.map((lead) => lead.id), "unsubscribed");
  logMailEvent("email_unsubscribed", { userId, leadsUpdated: leads.length });
}
