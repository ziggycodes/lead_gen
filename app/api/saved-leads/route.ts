import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { leadKey, type LeadLike } from "@/lib/leadKey";

export const dynamic = "force-dynamic";

// List all leads the current user has saved.
export async function GET() {
  try {
    const user = await ensureUser();
    const rows = await db().query.savedLeads.findMany({
      where: eq(schema.savedLeads.userId, user.id),
      orderBy: [desc(schema.savedLeads.createdAt)],
    });
    return NextResponse.json({
      leads: rows.map((r) => ({ ...(r.lead as object), _key: r.leadKey })),
      keys: rows.map((r) => r.leadKey),
    });
  } catch (err) {
    return handleError(err);
  }
}

// Save (star) a lead. Idempotent thanks to the unique (user, leadKey) index.
export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const lead = body?.lead as LeadLike | undefined;
    if (!lead || typeof lead !== "object") {
      return NextResponse.json({ error: "Missing lead payload." }, { status: 400 });
    }
    const key = leadKey(lead);
    await db()
      .insert(schema.savedLeads)
      .values({ userId: user.id, leadKey: key, lead })
      .onConflictDoNothing({
        target: [schema.savedLeads.userId, schema.savedLeads.leadKey],
      });
    return NextResponse.json({ saved: true, key });
  } catch (err) {
    return handleError(err);
  }
}

// Remove a saved lead by its key.
export async function DELETE(req: NextRequest) {
  try {
    const user = await ensureUser();
    const key = req.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "Missing lead key." }, { status: 400 });
    }
    await db()
      .delete(schema.savedLeads)
      .where(
        and(eq(schema.savedLeads.userId, user.id), eq(schema.savedLeads.leadKey, key))
      );
    return NextResponse.json({ saved: false, key });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.json({ error: (err as Error).message }, { status: 500 });
}
