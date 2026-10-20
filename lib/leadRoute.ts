import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";

export type LeadRouteContext = { params: Promise<{ id: string }> };

// Resolve `[id]` to a lead owned by the given user, or null.
export async function findOwnedLead(userId: number, ctx: LeadRouteContext) {
  const { id } = await ctx.params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId) || leadId <= 0) return null;
  const row = await db().query.leads.findFirst({
    where: and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)),
  });
  return row ?? null;
}
