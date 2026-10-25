import { NextRequest, NextResponse } from "next/server";
import { listAdminActions } from "@/lib/adminAudit";
import { badRequest, errorResponse, logAdminFailure } from "@/lib/apiError";
import { requireAdmin } from "@/lib/users";

export const dynamic = "force-dynamic";

const PAGE = 50;

// GET /api/admin/activity?before=
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const raw = req.nextUrl.searchParams.get("before");
    const before = raw ? Number(raw) : undefined;
    if (before !== undefined && (!Number.isInteger(before) || before <= 0)) {
      return badRequest("Invalid cursor.");
    }
    const actions = await listAdminActions({ before, limit: PAGE });
    return NextResponse.json({
      actions,
      nextCursor: actions.length === PAGE ? actions[actions.length - 1].id : null,
    });
  } catch (err) {
    logAdminFailure("admin_activity_failed", err);
    return errorResponse(err);
  }
}
