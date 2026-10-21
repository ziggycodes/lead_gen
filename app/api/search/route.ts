import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, isPremiumPlan } from "@/lib/users";
import { errorResponse } from "@/lib/apiError";
import { emailAllowance, recordEmailsFound, recordUsage, getUsage } from "@/lib/usage";
import { filterContactable } from "@/src/contactable.js";
import { admitWithinEmailCap, countEmailLeads } from "@/src/emailCap.js";
import { REGULAR_DAILY_LEADS } from "@/lib/plans";
import { planRegularSearch } from "@/src/regularSearch.js";
import { listNicheKeys } from "@/src/niches.js";
import { listStateIsoCodes, stateNameFromIso } from "@/src/usStates.js";

export const dynamic = "force-dynamic";
// Vercel caps this at 300s on Hobby and 800s on Pro; higher values fail the deploy.
export const maxDuration = 300;

// Server-controlled politeness delay between Overpass queries (not user-facing).
const OVERPASS_DELAY_MS = 1000;

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await ensureUser();
  } catch (err) {
    return errorResponse(err);
  }

  if (user.accountStatus === "flagged") {
    const reason = user.accountNote?.trim();
    return Response.json(
      { error: reason ? `New searches are paused. Reason: ${reason}` : "New searches are paused." },
      { status: 403 }
    );
  }

  const params = req.nextUrl.searchParams;
  const premium = isPremiumPlan(user.plan);
  const usageNow = await getUsage(user.id);

  let niches = "";
  let states = "US";
  let limit = 50;
  let perNicheLimit: number | undefined;
  let stateLabel: string | null = null;

  if (!premium) {
    const remaining = REGULAR_DAILY_LEADS - usageNow.consumedToday;
    if (remaining <= 0) {
      return Response.json({ error: "You've used today's 20 leads." }, { status: 403 });
    }
    const planned = planRegularSearch({
      nicheKeys: listNicheKeys(),
      stateCodes: listStateIsoCodes(),
      remaining,
    });
    if (!planned.state || planned.niches.length === 0) {
      return Response.json({ error: "No places are available to search." }, { status: 500 });
    }
    niches = planned.niches.join(",");
    states = planned.state;
    limit = planned.limit;
    perNicheLimit = planned.perNicheLimit;
    stateLabel = stateNameFromIso(planned.state) || planned.state;
  } else {
    niches = (params.get("niches") || "").trim();
    states = (params.get("states") || "US").trim() || "US";
    limit = Math.max(1, parseInt(params.get("limit") || "50", 10) || 50);
    if (!niches) {
      return Response.json({ error: "Pick at least one niche." }, { status: 400 });
    }
  }

  const allowance = await emailAllowance(user.id, user.emailDailyLimit);
  if (allowance.remaining === 0) {
    return Response.json(
      { error: `You've reached today's email limit (${allowance.limit}).` },
      { status: 403 }
    );
  }
  const emailBudget = allowance.remaining;

  // Block parallel runs per user.
  const running = await db().query.searches.findFirst({
    where: eq(schema.searches.userId, user.id),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  if (running && running.status === "running") {
    // Consider searches stuck >1h as dead rather than blocking the user forever.
    const ageMs = Date.now() - new Date(running.createdAt).getTime();
    if (ageMs < 60 * 60 * 1000) {
      return Response.json(
        { error: "You already have a search running. Wait for it to finish." },
        { status: 409 }
      );
    }
    await db()
      .update(schema.searches)
      .set({ status: "failed", error: "timed out" })
      .where(eq(schema.searches.id, running.id));
  }

  const [searchRow] = await db()
    .insert(schema.searches)
    .values({
      userId: user.id,
      status: "running",
      params: { niches, states, limit },
    })
    .returning();

  const encoder = new TextEncoder();
  let clientCancelled = false;
  let stoppedForCap = false;
  req.signal.addEventListener("abort", () => {
    clientCancelled = true;
  });

  const userId = user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may already be closed if the client disconnected.
        }
      };

      // Mirrored from the onLeads callback so a mid-run failure still persists
      // and returns whatever was collected before it broke.
      const collected: unknown[] = [];
      let emailsKept = 0;
      let capNotice: string | null = null;
      if (stateLabel) send("meta", { stateName: stateLabel });

      try {
        const [{ runSearch }, { overpassDbCache }, { findDecisionMakers, hasDecisionMakerLookup }] =
          await Promise.all([
            import("@/src/runSearch.js"),
            import("@/lib/overpassCache"),
            import("@/lib/decisionMakers"),
          ]);
        const dmEnabled = hasDecisionMakerLookup();
        const dmLimit = Number(process.env.DECISION_MAKER_MAX_PER_SEARCH) || 25;

        const { summary } = await runSearch(
          {
            niches,
            states,
            limit,
            perNicheLimit,
            delayMs: OVERPASS_DELAY_MS,
            noEnrich: true, // web users get the Basic engine (see pricing plan)
            cache: overpassDbCache,
            // Free contact scraping runs regardless of the enrichment tier.
            scrapeContacts: true,
            // Decision-maker lookup runs only when a SerpApi key is present.
            findDecisionMakers: dmEnabled ? findDecisionMakers : null,
            decisionMakerLimit: dmLimit,
          },
          {
            onLog: (msg: string) => send("log", { msg }),
            onProgress: (p: unknown) => send("progress", p),
            // Push rows to the table as they're found so a long run shows
            // results immediately instead of only at the end.
            onLeads: (fresh: unknown[]) => {
              const contactable = filterContactable(fresh);
              const admitted = admitWithinEmailCap(contactable, emailBudget, emailsKept);
              emailsKept = admitted.emails;
              if (admitted.capped && !stoppedForCap) {
                stoppedForCap = true;
                capNotice = `This search stopped because you reached today's email limit of ${allowance.limit}.`;
                send("log", { msg: capNotice });
              }
              if (!admitted.keep.length) return;
              collected.push(...admitted.keep);
              send("leads", { leads: admitted.keep });
            },
            onContactProgress: (p: unknown) => send("contact", p),
            onDecisionMakerProgress: (p: unknown) => send("decision", p),
            isCancelled: () => clientCancelled || stoppedForCap,
          }
        );

        const kept = collected;
        await recordUsage(userId, kept.length);
        await recordEmailsFound(userId, countEmailLeads(kept));
        await db()
          .update(schema.searches)
          .set({
            status: clientCancelled ? "cancelled" : "completed",
            leadCount: kept.length,
            resultBlob: kept,
            completedAt: new Date(),
          })
          .where(eq(schema.searches.id, searchRow.id));

        const usage = await getUsage(userId);
        send("done", {
          summary: { ...summary, total: kept.length },
          leads: kept,
          usage,
          searchId: searchRow.id,
          notice: capNotice,
        });
      } catch (err) {
        const kept = collected;
        await recordUsage(userId, kept.length);
        await recordEmailsFound(userId, countEmailLeads(kept));
        await db()
          .update(schema.searches)
          .set({
            status: "failed",
            error: (err as Error).message,
            leadCount: kept.length,
            resultBlob: kept,
            completedAt: new Date(),
          })
          .where(eq(schema.searches.id, searchRow.id));
        send("error", { message: (err as Error).message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
