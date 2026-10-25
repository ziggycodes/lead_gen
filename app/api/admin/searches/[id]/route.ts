import { NextRequest, NextResponse } from "next/server";
import { recordAdminAction } from "@/lib/adminAudit";
import { findAdminSearch } from "@/lib/adminStats";
import { badRequest, errorResponse, logAdminFailure } from "@/lib/apiError";
import { db } from "@/lib/db";
import { markStaleJobs, requestCancel } from "@/lib/searchJobs";
import { requireAdmin } from "@/lib/users";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/searches/:id { action: "cancel" }
// A stuck job has no worker left to honour a cancel flag, so it is failed outright instead.
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { email: adminEmail } = await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return badRequest("Invalid search id.");
    const body = await req.json().catch(() => null);
    if (body?.action !== "cancel") return badRequest("Unknown action.");

    const search = await findAdminSearch(id);
    if (!search) return badRequest("Search not found.", 404);
    if (search.status !== "queued" && search.status !== "running" && search.status !== "stuck") {
      return badRequest("That search has already finished.");
    }

    if (search.status === "stuck") {
      await markStaleJobs(search.userId);
    } else {
      await requestCancel(search.userId, id);
    }
    await recordAdminAction(db(), {
      adminEmail,
      action: search.status === "stuck" ? "fail_stuck_search" : "cancel_search",
      targetUserId: search.userId,
      detail: { searchId: id },
    });

    return NextResponse.json({ search: await findAdminSearch(id) });
  } catch (err) {
    logAdminFailure("admin_search_action_failed", err);
    return errorResponse(err);
  }
}
