import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser } from "@/lib/users";
import { isLeadStatus } from "@/lib/crm";
import { backfillLegacyLeads, logActivity, serializeLead, upsertLeads } from "@/lib/leads";
import { badRequest, errorResponse, parseIds } from "@/lib/apiError";
import { filterContactable } from "@/src/contactable.js";
import { leadKey, type LeadLike } from "@/lib/leadKey";

export const dynamic = "force-dynamic";

const MAX_LEADS = 5000;
const MAX_IMPORT = 500;

// GET /api/leads -> every CRM lead for the signed-in account (filtered client-side).
export async function GET() {
  try {
    const user = await ensureUser();
    await backfillLegacyLeads(user.id);
    const rows = await db().query.leads.findMany({
      where: eq(schema.leads.userId, user.id),
      orderBy: [desc(schema.leads.lastActivityAt), desc(schema.leads.id)],
      limit: MAX_LEADS,
    });
    return NextResponse.json({ leads: rows.map(serializeLead), truncated: rows.length >= MAX_LEADS });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/leads  { leads, searchId? } -> save search results into the account CRM.
export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const raw = body?.leads;
    if (!Array.isArray(raw) || raw.length === 0) {
      return badRequest("Provide leads to save.");
    }
    if (raw.length > MAX_IMPORT) {
      return badRequest(`Save at most ${MAX_IMPORT} leads at a time.`);
    }

    const contactable = filterContactable(raw.filter((l) => l && typeof l === "object"));
    if (!contactable.length) {
      return badRequest("None of those leads have a phone or email.");
    }

    let sourceSearchId: number | null = null;
    if (body?.searchId != null && body.searchId !== "") {
      const id = Number(body.searchId);
      if (!Number.isInteger(id) || id <= 0) return badRequest("Invalid search id.");
      const row = await db().query.searches.findFirst({
        where: and(eq(schema.searches.id, id), eq(schema.searches.userId, user.id)),
        columns: { id: true },
      });
      if (!row) return badRequest("Search not found.");
      sourceSearchId = row.id;
    }

    const crm = await upsertLeads(user.id, contactable, {
      sourceSearchId,
      via: "save",
    });
    const ids: Record<string, number> = {};
    for (const [key, leadId] of crm.idsByKey) ids[key] = leadId;

    return NextResponse.json({
      inserted: crm.inserted,
      updated: crm.updated,
      ids,
      leads: contactable.map((l) => {
        const crmId = crm.idsByKey.get(leadKey(l as LeadLike));
        return crmId ? { ...(l as object), _crmId: crmId } : l;
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/leads  { ids, status?, saved? } -> bulk pipeline update.
export async function PATCH(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const ids = parseIds(body?.ids);
    if (!ids) return badRequest("Provide the lead ids to update.");

    const status = body?.status;
    const saved = body?.saved;
    if (status !== undefined && !isLeadStatus(status)) return badRequest("Unknown status.");
    if (saved !== undefined && typeof saved !== "boolean") return badRequest("Invalid saved flag.");
    if (status === undefined && saved === undefined) return badRequest("Nothing to update.");

    const owned = and(eq(schema.leads.userId, user.id), inArray(schema.leads.id, ids));
    const before = await db()
      .select({ id: schema.leads.id, status: schema.leads.status, saved: schema.leads.saved })
      .from(schema.leads)
      .where(owned);

    await db()
      .update(schema.leads)
      .set({
        ...(status !== undefined ? { status } : {}),
        ...(saved !== undefined ? { saved } : {}),
        updatedAt: new Date(),
      })
      .where(owned);

    if (status !== undefined) {
      const byFrom = new Map<string, number[]>();
      for (const r of before) {
        if (r.status === status) continue;
        byFrom.set(r.status, [...(byFrom.get(r.status) || []), r.id]);
      }
      for (const [from, leadIds] of byFrom) {
        await logActivity(user.id, leadIds, "status_changed", { from, to: status });
      }
    }
    if (saved !== undefined) {
      const changed = before.filter((r) => r.saved !== saved).map((r) => r.id);
      await logActivity(user.id, changed, saved ? "saved" : "unsaved");
    }

    const rows = await db().query.leads.findMany({ where: owned });
    return NextResponse.json({ leads: rows.map(serializeLead) });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/leads  { ids } -> remove leads (notes and activity cascade).
export async function DELETE(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const ids = parseIds(body?.ids);
    if (!ids) return badRequest("Provide the lead ids to delete.");
    const deleted = await db()
      .delete(schema.leads)
      .where(and(eq(schema.leads.userId, user.id), inArray(schema.leads.id, ids)))
      .returning({ id: schema.leads.id });
    return NextResponse.json({ deleted: deleted.map((r) => r.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
