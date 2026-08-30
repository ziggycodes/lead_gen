import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { reserveQuota, reconcileQuota, getQuota, QuotaExceededError } from "@/lib/quota";
import { overpassDbCache } from "@/lib/overpassCache";
import { runSearch } from "@/src/runSearch.js";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

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
  const requestedLimit = Math.max(1, parseInt(params.get("limit") || "50", 10) || 50);

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

  let reserved: number;
  try {
    reserved = await reserveQuota(user.id, requestedLimit);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return Response.json(
        { error: err.message, quota: err.snapshot, upgrade: true },
        { status: 402 }
      );
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  const [searchRow] = await db()
    .insert(schema.searches)
    .values({
      userId: user.id,
      status: "running",
      params: { niches, states, limit: reserved },
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

      try {
        if (reserved < requestedLimit) {
          send("log", {
            msg: `Limit capped to ${reserved} leads based on your remaining balance/daily cap.`,
          });
        }

        const { leads, summary } = await runSearch(
          {
            niches,
            states,
            limit: reserved,
            delayMs: OVERPASS_DELAY_MS,
            noEnrich: true, // web users get the Basic engine (see pricing plan)
            cache: overpassDbCache,
          },
          {
            onLog: (msg: string) => send("log", { msg }),
            onProgress: (p: unknown) => send("progress", p),
            isCancelled: () => cancelled,
          }
        );

        await reconcileQuota(userId, reserved, leads.length);
        await db()
          .update(schema.searches)
          .set({
            status: cancelled ? "cancelled" : "completed",
            leadCount: leads.length,
            resultBlob: leads,
            completedAt: new Date(),
          })
          .where(eq(schema.searches.id, searchRow.id));

        const quota = await getQuota(userId);
        send("done", { summary, leads, quota, searchId: searchRow.id });
      } catch (err) {
        await reconcileQuota(userId, reserved, 0);
        await db()
          .update(schema.searches)
          .set({ status: "failed", error: (err as Error).message, completedAt: new Date() })
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
