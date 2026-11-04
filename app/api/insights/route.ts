import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse, parseIds } from "@/lib/apiError";
import { INSIGHTS_REQUESTED, inngest } from "@/lib/inngest/client";
import { AiNotConfiguredError, InsightError, MAX_INSIGHT_LEADS, assertAiAllowed, markInsightsPending } from "@/lib/insights";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    await assertAiAllowed(user.id);
    const body = await req.json().catch(() => null);
    const ids = parseIds(body?.leadIds, MAX_INSIGHT_LEADS);
    if (!ids) return badRequest(`Select between 1 and ${MAX_INSIGHT_LEADS} leads.`);
    const leadIds = await markInsightsPending(user.id, ids);
    if (!leadIds.length) return badRequest("None of those leads were found.");
    await inngest.send({ name: INSIGHTS_REQUESTED, data: { userId: user.id, leadIds } });
    return NextResponse.json({ queued: leadIds });
  } catch (err) {
    if (err instanceof InsightError) return badRequest(err.message);
    if (err instanceof AiNotConfiguredError) return badRequest(err.message, 503);
    return errorResponse(err);
  }
}
