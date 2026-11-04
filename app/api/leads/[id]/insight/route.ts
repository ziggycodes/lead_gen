import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { badRequest, errorResponse } from "@/lib/apiError";
import { AiNotConfiguredError, InsightError, assertAiAllowed, researchLead, saveInsightEdits } from "@/lib/insights";
import { serializeLead } from "@/lib/leads";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";
// Site fetches (up to ~36s) plus one model call.
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

function leadId(id: string): number | null {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = leadId((await ctx.params).id);
    if (!id) return badRequest("Lead not found.", 404);
    const offer = await assertAiAllowed(user.id);
    const lead = await researchLead(user.id, id, offer);
    if (!lead) return badRequest("Lead not found.", 404);
    return NextResponse.json({ lead: serializeLead(lead) });
  } catch (err) {
    if (err instanceof InsightError) return badRequest(err.message);
    if (err instanceof AiNotConfiguredError) return badRequest(err.message, 503);
    if (err instanceof Anthropic.RateLimitError) return badRequest("AI research is busy. Try again in a minute.", 429);
    if (err instanceof Anthropic.APIError || err instanceof Anthropic.APIConnectionError) {
      return badRequest("AI research is unavailable right now. Try again shortly.", 503);
    }
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = leadId((await ctx.params).id);
    if (!id) return badRequest("Lead not found.", 404);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Nothing to save.");
    const lead = await saveInsightEdits(user.id, id, body);
    if (!lead) return badRequest("Lead not found.", 404);
    return NextResponse.json({ lead: serializeLead(lead) });
  } catch (err) {
    if (err instanceof InsightError) return badRequest(err.message);
    return errorResponse(err);
  }
}
