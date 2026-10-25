import { NextRequest, NextResponse } from "next/server";
import { errorResponse, logAdminFailure } from "@/lib/apiError";
import { overviewStats, parseRange } from "@/lib/adminStats";
import { requireAdmin } from "@/lib/users";

export const dynamic = "force-dynamic";

// GET /api/admin/stats?range=7d|30d
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const stats = await overviewStats(parseRange(req.nextUrl.searchParams.get("range")));
    return NextResponse.json({ stats });
  } catch (err) {
    logAdminFailure("admin_stats_failed", err);
    return errorResponse(err);
  }
}
