import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser } from "@/lib/users";
import { logActivity } from "@/lib/leads";
import { findOwnedLead, type LeadRouteContext } from "@/lib/leadRoute";
import { badRequest, errorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const MAX_NOTE_LENGTH = 5000;

// POST /api/leads/:id/notes  { body }
export async function POST(req: NextRequest, ctx: LeadRouteContext) {
  try {
    const user = await ensureUser();
    const lead = await findOwnedLead(user.id, ctx);
    if (!lead) return badRequest("Lead not found.", 404);

    const payload = await req.json().catch(() => null);
    const text = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (!text) return badRequest("Note can't be empty.");
    if (text.length > MAX_NOTE_LENGTH) return badRequest("Note is too long.");

    const [note] = await db()
      .insert(schema.leadNotes)
      .values({ leadId: lead.id, userId: user.id, body: text })
      .returning();
    await logActivity(user.id, [lead.id], "note_added", { noteId: note.id });

    return NextResponse.json({
      note: { id: note.id, body: note.body, createdAt: note.createdAt.toISOString() },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/leads/:id/notes?noteId=123
export async function DELETE(req: NextRequest, ctx: LeadRouteContext) {
  try {
    const user = await ensureUser();
    const lead = await findOwnedLead(user.id, ctx);
    if (!lead) return badRequest("Lead not found.", 404);

    const noteId = Number(req.nextUrl.searchParams.get("noteId"));
    if (!Number.isInteger(noteId) || noteId <= 0) return badRequest("Missing noteId.");

    await db()
      .delete(schema.leadNotes)
      .where(and(eq(schema.leadNotes.id, noteId), eq(schema.leadNotes.leadId, lead.id)));
    return NextResponse.json({ deleted: noteId });
  } catch (err) {
    return errorResponse(err);
  }
}
