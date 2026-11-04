import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { MailboxAuthError } from "@/lib/mail/errors";
import { cleanTemplateInput, deleteTemplate, updateTemplate } from "@/lib/mail/templates";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function templateId(id: string): number | null {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = templateId((await ctx.params).id);
    if (!id) return badRequest("Template not found.", 404);
    const input = cleanTemplateInput(await req.json().catch(() => null));
    return NextResponse.json({ template: await updateTemplate(user.id, id, input) });
  } catch (err) {
    if (err instanceof MailboxAuthError) return badRequest(err.message);
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await ensureUser();
    const id = templateId((await ctx.params).id);
    if (!id) return badRequest("Template not found.", 404);
    await deleteTemplate(user.id, id);
    return NextResponse.json({ deleted: id });
  } catch (err) {
    if (err instanceof MailboxAuthError) return badRequest(err.message, 404);
    return errorResponse(err);
  }
}
