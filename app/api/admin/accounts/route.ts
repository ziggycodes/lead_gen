import { NextRequest, NextResponse } from "next/server";
import { AccountActionError, applyAccountAction, listAccounts } from "@/lib/accounts";
import { errorResponse } from "@/lib/apiError";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/users";

export const dynamic = "force-dynamic";

function logFailure(err: unknown) {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof AccountActionError
  ) {
    return;
  }
  console.error(
    JSON.stringify({
      event: "account_action_failed",
      name: err instanceof Error ? err.name : "Error",
    })
  );
}

export async function GET() {
  try {
    await requireAdmin();
    const accounts = await listAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    logFailure(err);
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { email: adminEmail } = await requireAdmin();
    const body = await req.json().catch(() => null);
    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Choose an account." }, { status: 400 });
    }
    const action = typeof body?.action === "string" ? body.action : "";
    const account = await applyAccountAction({
      adminEmail,
      userId,
      action,
      emailDailyLimit: body?.emailDailyLimit,
      note: body?.note,
    });
    return NextResponse.json({ account });
  } catch (err) {
    logFailure(err);
    if (err instanceof AccountActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err);
  }
}
