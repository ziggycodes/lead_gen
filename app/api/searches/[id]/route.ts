import { NextRequest, NextResponse } from "next/server";
import { ensureUser } from "@/lib/users";
import { badRequest, errorResponse } from "@/lib/apiError";
import { findJob, markJobSeen, markStaleJobs, requestCancel, toJobView } from "@/lib/searchJobs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function searchIdFrom(ctx: Ctx): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/searches/:id -> status and progress of one background search.
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const user = await ensureUser();
    const id = await searchIdFrom(ctx);
    if (!id) return badRequest("Invalid search id.");
    await markStaleJobs(user.id);
    const row = await findJob(user.id, id);
    if (!row) return badRequest("Search not found.", 404);
    return NextResponse.json({ search: toJobView(row) });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/searches/:id { action: "cancel" | "seen" }
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const user = await ensureUser();
    const id = await searchIdFrom(ctx);
    if (!id) return badRequest("Invalid search id.");
    const body = await req.json().catch(() => null);

    if (body?.action === "cancel") {
      const row = await requestCancel(user.id, id);
      if (!row) return badRequest("Search not found.", 404);
      return NextResponse.json({ search: toJobView(row) });
    }
    if (body?.action === "seen") {
      await markJobSeen(user.id, id);
      return NextResponse.json({ ok: true });
    }
    return badRequest("Unknown action.");
  } catch (err) {
    return errorResponse(err);
  }
}
