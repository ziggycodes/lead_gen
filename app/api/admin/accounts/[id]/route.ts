import { NextRequest, NextResponse } from "next/server";
import { loadAccountById } from "@/lib/accounts";
import { accountDetail } from "@/lib/adminStats";
import { badRequest, errorResponse, logAdminFailure } from "@/lib/apiError";
import { requireAdmin } from "@/lib/users";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/accounts/:id -> the account plus its searches, payments, notices and audit trail.
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return badRequest("Choose an account.");
    const account = await loadAccountById(id);
    if (!account) return badRequest("That account doesn't exist.", 404);
    const detail = await accountDetail(id);
    return NextResponse.json({ account, detail });
  } catch (err) {
    logAdminFailure("admin_account_detail_failed", err);
    return errorResponse(err);
  }
}
