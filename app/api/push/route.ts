import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { parseSubscription, removeSubscription, saveSubscription } from "@/lib/push";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const sub = parseSubscription(await req.json().catch(() => null));
    if (!sub) return badRequest("That browser subscription isn't valid.");
    await saveSubscription(user.id, sub, req.headers.get("user-agent"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string" || !endpoint) return badRequest("Missing subscription endpoint.");
    await removeSubscription(user.id, endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
