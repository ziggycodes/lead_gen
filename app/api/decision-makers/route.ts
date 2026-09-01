import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import pLimit from "p-limit";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { leadKey, type LeadLike } from "@/lib/leadKey";
import {
  findDecisionMakers,
  hasDecisionMakerLookup,
} from "@/lib/decisionMakers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_KEYS = 10;
const LOOKUP_CONCURRENCY = 2;

// POST /api/decision-makers
// Body: { searchId: number, keys: string[] }
// Finds LinkedIn decision-maker profiles for the requested leads within one of
// the caller's own searches, persists them into the stored result blob (and any
// matching saved leads), and returns the updated leads.
export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();

    if (!hasDecisionMakerLookup()) {
      return NextResponse.json(
        { error: "Decision-maker lookup is not available right now." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    const searchId = Number(body?.searchId);
    const keys: unknown = body?.keys;

    if (!Number.isInteger(searchId)) {
      return NextResponse.json({ error: "Missing or invalid searchId." }, { status: 400 });
    }
    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: "Provide at least one lead key." }, { status: 400 });
    }
    if (keys.length > MAX_KEYS) {
      return NextResponse.json(
        { error: `Look up at most ${MAX_KEYS} leads at a time.` },
        { status: 400 }
      );
    }
    const requestedKeys = new Set(keys.map((k) => String(k)));

    const search = await db().query.searches.findFirst({
      where: and(
        eq(schema.searches.id, searchId),
        eq(schema.searches.userId, user.id)
      ),
    });
    if (!search) {
      return NextResponse.json({ error: "Search not found." }, { status: 404 });
    }

    const leads = ((search.resultBlob as Record<string, unknown>[]) || []).slice();

    // Resolve the requested keys to blob indexes, skipping leads that already
    // have a lookup result so each lead costs at most one SerpApi call.
    const targets: number[] = [];
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const key = leadKey(lead as LeadLike);
      if (!requestedKeys.has(key)) continue;
      if (lead.decisionMakerStatus) continue;
      targets.push(i);
    }

    if (targets.length > 0) {
      const limiter = pLimit(LOOKUP_CONCURRENCY);
      await Promise.all(
        targets.map((idx) =>
          limiter(async () => {
            const lead = leads[idx];
            try {
              const matches = await findDecisionMakers({
                name: lead.name as string,
                city: lead.city as string,
                state: lead.state as string,
                website: lead.website as string,
              });
              leads[idx] = {
                ...lead,
                decisionMakers: matches,
                decisionMakerStatus: matches.length > 0 ? "found" : "none",
              };
            } catch {
              leads[idx] = { ...lead, decisionMakerStatus: "error" };
            }
          })
        )
      );

      await db()
        .update(schema.searches)
        .set({ resultBlob: leads })
        .where(eq(schema.searches.id, search.id));

      // Keep any starred snapshots for these leads in sync.
      const updatedByKey = new Map<string, Record<string, unknown>>();
      for (const idx of targets) {
        updatedByKey.set(leadKey(leads[idx] as LeadLike), leads[idx]);
      }
      const saved = await db().query.savedLeads.findMany({
        where: eq(schema.savedLeads.userId, user.id),
      });
      await Promise.all(
        saved
          .filter((row) => updatedByKey.has(row.leadKey))
          .map((row) =>
            db()
              .update(schema.savedLeads)
              .set({ lead: updatedByKey.get(row.leadKey) })
              .where(
                and(
                  eq(schema.savedLeads.userId, user.id),
                  eq(schema.savedLeads.leadKey, row.leadKey)
                )
              )
          )
      );
    }

    return NextResponse.json({ leads });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
