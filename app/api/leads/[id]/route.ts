import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser } from "@/lib/users";
import { EDITABLE_LEAD_FIELDS, isLeadStatus, type EditableLeadField } from "@/lib/crm";
import { logActivity, serializeLead } from "@/lib/leads";
import { findOwnedLead, type LeadRouteContext } from "@/lib/leadRoute";
import { badRequest, errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 500;

async function loadDetail(leadId: number) {
  const [notes, activities] = await Promise.all([
    db().query.leadNotes.findMany({
      where: eq(schema.leadNotes.leadId, leadId),
      orderBy: [desc(schema.leadNotes.createdAt)],
    }),
    db().query.leadActivities.findMany({
      where: eq(schema.leadActivities.leadId, leadId),
      orderBy: [desc(schema.leadActivities.createdAt), desc(schema.leadActivities.id)],
      limit: 100,
    }),
  ]);
  return {
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() })),
    activities: activities.map((a) => ({
      id: a.id,
      type: a.type,
      detail: a.detail,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export async function GET(_req: NextRequest, ctx: LeadRouteContext) {
  try {
    const user = await ensureUser();
    const lead = await findOwnedLead(user.id, ctx);
    if (!lead) return badRequest("Lead not found.", 404);
    return NextResponse.json({ lead: serializeLead(lead), ...(await loadDetail(lead.id)) });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/leads/:id  { fields?, status?, saved?, followUpAt? }
export async function PATCH(req: NextRequest, ctx: LeadRouteContext) {
  try {
    const user = await ensureUser();
    const lead = await findOwnedLead(user.id, ctx);
    if (!lead) return badRequest("Lead not found.", 404);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Missing update payload.");

    const updates: Partial<typeof schema.leads.$inferInsert> = {};
    const changedFields: EditableLeadField[] = [];

    if (body.fields && typeof body.fields === "object") {
      for (const field of EDITABLE_LEAD_FIELDS) {
        const value = body.fields[field];
        if (value === undefined) continue;
        if (typeof value !== "string") return badRequest(`Invalid value for ${field}.`);
        const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
        if (field === "name" && !trimmed) return badRequest("Business name can't be empty.");
        if (trimmed !== lead[field]) {
          updates[field] = trimmed;
          changedFields.push(field);
        }
      }
    }

    if (body.status !== undefined) {
      if (!isLeadStatus(body.status)) return badRequest("Unknown status.");
      if (body.status !== lead.status) updates.status = body.status;
    }

    if (body.saved !== undefined) {
      if (typeof body.saved !== "boolean") return badRequest("Invalid saved flag.");
      if (body.saved !== lead.saved) updates.saved = body.saved;
    }

    let followUpChanged = false;
    if (body.followUpAt !== undefined) {
      let next: Date | null = null;
      if (body.followUpAt !== null && body.followUpAt !== "") {
        next = new Date(body.followUpAt);
        if (Number.isNaN(next.getTime())) return badRequest("Invalid follow-up date.");
      }
      const prev = lead.followUpAt?.getTime() ?? null;
      if ((next?.getTime() ?? null) !== prev) {
        updates.followUpAt = next;
        followUpChanged = true;
      }
    }

    if (Object.keys(updates).length) {
      await db()
        .update(schema.leads)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.leads.id, lead.id));

      if (updates.status) {
        await logActivity(user.id, [lead.id], "status_changed", { from: lead.status, to: updates.status });
      }
      if (updates.saved !== undefined) {
        await logActivity(user.id, [lead.id], updates.saved ? "saved" : "unsaved");
      }
      if (changedFields.length) {
        await logActivity(user.id, [lead.id], "updated", { fields: changedFields });
      }
      if (followUpChanged) {
        await logActivity(user.id, [lead.id], "follow_up_set", {
          at: updates.followUpAt ? updates.followUpAt.toISOString() : null,
        });
      }
    }

    const fresh = await db().query.leads.findFirst({ where: eq(schema.leads.id, lead.id) });
    return NextResponse.json({ lead: serializeLead(fresh!), ...(await loadDetail(lead.id)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: LeadRouteContext) {
  try {
    const user = await ensureUser();
    const lead = await findOwnedLead(user.id, ctx);
    if (!lead) return badRequest("Lead not found.", 404);
    await db().delete(schema.leads).where(eq(schema.leads.id, lead.id));
    return NextResponse.json({ deleted: lead.id });
  } catch (err) {
    return errorResponse(err);
  }
}
