import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { MailboxAuthError } from "@/lib/mail/errors";
import { cleanTemplateInput, createTemplate, listTemplates } from "@/lib/mail/templates";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    return NextResponse.json({ templates: await listTemplates(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const input = cleanTemplateInput(await req.json().catch(() => null));
    return NextResponse.json({ template: await createTemplate(user.id, input) });
  } catch (err) {
    if (err instanceof MailboxAuthError) return badRequest(err.message);
    return errorResponse(err);
  }
}
