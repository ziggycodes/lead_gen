import { searchRouteBoot } from "@/lib/searchRouteBoot";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { recordUsage, getUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

// Server-controlled politeness delay between Overpass queries (not user-facing).
const OVERPASS_DELAY_MS = 1000;

export async function GET(req: NextRequest) {
  // #region agent log
  fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e14203" },
    body: JSON.stringify({
      sessionId: "e14203",
      runId: "pre-fix",
      hypothesisId: "A",
      location: "search/route.ts:GET",
      message: "search GET handler entered",
      data: { boot: searchRouteBoot, niches: req.nextUrl.searchParams.get("niches"), states: req.nextUrl.searchParams.get("states"), limit: req.nextUrl.searchParams.get("limit") },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  // #region agent log
  fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
    body: JSON.stringify({
      sessionId: "b660e9",
      runId: "post-fix",
      hypothesisId: "G",
      location: "search/route.ts:GET",
      message: "search GET handler entered",
      data: { url: req.nextUrl.toString() },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  let user;
  try {
    user = await ensureUser();
    // #region agent log
    fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
      body: JSON.stringify({
        sessionId: "b660e9",
        runId: "pre-fix",
        hypothesisId: "G",
        location: "search/route.ts:ensureUser",
        message: "ensureUser resolved",
        data: { userId: user.id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    // #region agent log
    fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e14203" },
      body: JSON.stringify({
        sessionId: "e14203",
        runId: "pre-fix",
        hypothesisId: "C",
        location: "search/route.ts:ensureUser",
        message: "ensureUser resolved",
        data: { userId: user.id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch (err) {
    const status = err instanceof UnauthorizedError ? 401 : 500;
    return Response.json({ error: (err as Error).message }, { status });
  }

  const params = req.nextUrl.searchParams;
  const niches = (params.get("niches") || "").trim();
  const states = (params.get("states") || "US").trim() || "US";
  const limit = Math.max(1, parseInt(params.get("limit") || "50", 10) || 50);

  if (!niches) {
    return Response.json({ error: "Pick at least one niche." }, { status: 400 });
  }

  // Block parallel runs per user.
  const running = await db().query.searches.findFirst({
    where: eq(schema.searches.userId, user.id),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  if (running && running.status === "running") {
    // Consider searches stuck >1h as dead rather than blocking the user forever.
    const ageMs = Date.now() - new Date(running.createdAt).getTime();
    if (ageMs < 60 * 60 * 1000) {
      // #region agent log
      fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
        body: JSON.stringify({
          sessionId: "b660e9",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "search/route.ts:409",
          message: "blocked by existing running search",
          data: { searchId: running.id, ageMs, niches, states, limit },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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
  let cancelled = false;
  req.signal.addEventListener("abort", () => {
    cancelled = true;
  });

  const userId = user.id;
  // #region agent log
  fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
    body: JSON.stringify({
      sessionId: "b660e9",
      runId: "pre-fix",
      hypothesisId: "A",
      location: "search/route.ts:start",
      message: "search stream starting",
      data: { searchId: searchRow.id, niches, states, limit },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
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

      try {
        // #region agent log
        fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e14203" },
          body: JSON.stringify({
            sessionId: "e14203",
            runId: "post-fix",
            hypothesisId: "B",
            location: "search/route.ts:before-import",
            message: "loading lead engine",
            data: { searchId: searchRow.id },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        const [{ runSearch }, { overpassDbCache }, { findDecisionMakers, hasDecisionMakerLookup }] =
          await Promise.all([
            import("@/src/runSearch.js"),
            import("@/lib/overpassCache"),
            import("@/lib/decisionMakers"),
          ]);
        const dmEnabled = hasDecisionMakerLookup();
        const dmLimit = Number(process.env.DECISION_MAKER_MAX_PER_SEARCH) || 25;

        const { leads, summary } = await runSearch(
          {
            niches,
            states,
            limit,
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
              collected.push(...fresh);
              // #region agent log
              fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
                body: JSON.stringify({
                  sessionId: "b660e9",
                  runId: "pre-fix",
                  hypothesisId: "D",
                  location: "search/route.ts:onLeads",
                  message: "server emitting leads event",
                  data: { batch: fresh.length, collected: collected.length },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
              send("leads", { leads: fresh });
            },
            onContactProgress: (p: unknown) => send("contact", p),
            onDecisionMakerProgress: (p: unknown) => send("decision", p),
            isCancelled: () => cancelled,
          }
        );

        await recordUsage(userId, leads.length);
        await db()
          .update(schema.searches)
          .set({
            status: cancelled ? "cancelled" : "completed",
            leadCount: leads.length,
            resultBlob: leads,
            completedAt: new Date(),
          })
          .where(eq(schema.searches.id, searchRow.id));

        const usage = await getUsage(userId);
        // #region agent log
        fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
          body: JSON.stringify({
            sessionId: "b660e9",
            runId: "pre-fix",
            hypothesisId: "B",
            location: "search/route.ts:done",
            message: "search completed",
            data: { searchId: searchRow.id, leadCount: leads.length, cancelled },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        send("done", { summary, leads, usage, searchId: searchRow.id });
      } catch (err) {
        await recordUsage(userId, collected.length);
        await db()
          .update(schema.searches)
          .set({
            status: "failed",
            error: (err as Error).message,
            leadCount: collected.length,
            resultBlob: collected,
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
