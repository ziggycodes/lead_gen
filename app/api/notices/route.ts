import { NextRequest, NextResponse } from "next/server";
import { markNoticesRead, unreadNotices } from "@/lib/accounts";
import { badRequest, errorResponse, parseIds } from "@/lib/apiError";
import { ensureUser } from "@/lib/users";
import { emailAllowance } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    const [notices, allowance] = await Promise.all([
      unreadNotices(user.id),
      emailAllowance(user.id, user.emailDailyLimit),
    ]);
    return NextResponse.json({
      notices,
      account: {
        status: user.accountStatus,
        note: user.accountNote,
        emailDailyLimit: allowance.limit,
        emailsFoundToday: allowance.foundToday,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const ids = parseIds(body?.ids, 20);
    if (!ids) return badRequest("Choose a notice to dismiss.");
    await markNoticesRead(user.id, ids);
    return NextResponse.json({ ids });
  } catch (err) {
    return errorResponse(err);
  }
}
