import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { removeMailbox, setDefaultMailbox } from "@/lib/mail/accounts";
import { MailboxAuthError } from "@/lib/mail/errors";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function accountId(id: string): number | null {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = accountId((await ctx.params).id);
    if (!id) return badRequest("Mailbox not found.", 404);
    const body = await req.json().catch(() => null);
    if (!body || body.isDefault !== true) return badRequest("Nothing to update.");
    const mailbox = await setDefaultMailbox(user.id, id);
    return NextResponse.json({ mailbox });
  } catch (err) {
    if (err instanceof MailboxAuthError) return badRequest(err.message, 404);
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = accountId((await ctx.params).id);
    if (!id) return badRequest("Mailbox not found.", 404);
    await removeMailbox(user.id, id);
    return NextResponse.json({ deleted: id });
  } catch (err) {
    if (err instanceof MailboxAuthError) return badRequest(err.message, 404);
    return errorResponse(err);
  }
}
