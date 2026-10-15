import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { recordUsage, getUsage } from "@/lib/usage";

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
