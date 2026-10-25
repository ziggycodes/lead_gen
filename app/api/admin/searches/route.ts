import { NextRequest, NextResponse } from "next/server";
import { listAdminSearches, type AdminSearchStatus } from "@/lib/adminStats";
import { badRequest, errorResponse, logAdminFailure } from "@/lib/apiError";
import { requireAdmin } from "@/lib/users";

export const dynamic = "force-dynamic";

const STATUSES: AdminSearchStatus[] = ["queued", "running", "completed", "failed", "cancelled", "stuck"];
const PAGE = 50;

// GET /api/admin/searches?status=&before=
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const params = req.nextUrl.searchParams;
    const rawStatus = params.get("status");
    if (rawStatus && !STATUSES.includes(rawStatus as AdminSearchStatus)) {
      return badRequest("Unknown status.");
    }
    const before = params.get("before") ? Number(params.get("before")) : undefined;
    if (before !== undefined && (!Number.isInteger(before) || before <= 0)) {
      return badRequest("Invalid cursor.");
    }
    const searches = await listAdminSearches({
      status: (rawStatus as AdminSearchStatus | null) || null,
      before,
      limit: PAGE,
    });
    return NextResponse.json({
      searches,
      nextCursor: searches.length === PAGE ? searches[searches.length - 1].id : null,
    });
  } catch (err) {
    logAdminFailure("admin_searches_failed", err);
    return errorResponse(err);
  }
}
