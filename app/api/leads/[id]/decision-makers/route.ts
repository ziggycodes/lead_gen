import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser } from "@/lib/users";
import { findDecisionMakers, hasDecisionMakerLookup } from "@/lib/decisionMakers";
import { logActivity, serializeLead } from "@/lib/leads";
import { findOwnedLead, type LeadRouteContext } from "@/lib/leadRoute";
import { badRequest, errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

// POST /api/leads/:id/decision-makers -> one SerpApi lookup for this lead.
export async function POST(_req: NextRequest, ctx: LeadRouteContext) {
  try {
    const user = await ensureUser();
    if (!hasDecisionMakerLookup()) {
      return badRequest("Decision-maker lookup is not available right now.", 503);
    }
    const lead = await findOwnedLead(user.id, ctx);
    if (!lead) return badRequest("Lead not found.", 404);

    let decisionMakers: unknown[] = [];
    let decisionMakerStatus: "found" | "none" | "error";
    try {
      decisionMakers = await findDecisionMakers({
        name: lead.name,
        city: lead.city,
        state: lead.state,
        website: lead.website,
      });
      decisionMakerStatus = decisionMakers.length > 0 ? "found" : "none";
    } catch {
      decisionMakerStatus = "error";
    }

    const [row] = await db()
      .update(schema.leads)
      .set({
        decisionMakers: decisionMakerStatus === "error" ? lead.decisionMakers : decisionMakers,
        decisionMakerStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.leads.id, lead.id))
      .returning();

    if (decisionMakerStatus === "found") {
      await logActivity(user.id, [lead.id], "decision_makers_found", { count: decisionMakers.length });
    }
    return NextResponse.json({ lead: serializeLead(row) });
  } catch (err) {
    return errorResponse(err);
  }
}
