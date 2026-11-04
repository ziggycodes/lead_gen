import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { bulkSendDetail, requestBulkCancel } from "@/lib/mail/bulk";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function sendId(id: string): number | null {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = sendId((await ctx.params).id);
    if (!id) return badRequest("Bulk send not found.", 404);
    const detail = await bulkSendDetail(user.id, id);
    if (!detail) return badRequest("Bulk send not found.", 404);
    return NextResponse.json(detail);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = sendId((await ctx.params).id);
    if (!id) return badRequest("Bulk send not found.", 404);
    const send = await requestBulkCancel(user.id, id);
    if (!send) return badRequest("That bulk send has already finished.", 409);
    return NextResponse.json({ send });
  } catch (err) {
    return errorResponse(err);
  }
}
