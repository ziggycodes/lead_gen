import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { connectMailbox, listMailboxes, type ConnectInput } from "@/lib/mail/accounts";
import { MailboxAuthError } from "@/lib/mail/errors";
import { isMailProvider } from "@/lib/mail/presets";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const user = await ensureUser();
    const mailboxes = await listMailboxes(user.id);
    return NextResponse.json({ mailboxes });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Missing mailbox details.");
    if (!isMailProvider(body.provider)) return badRequest("Choose Gmail or a business mailbox.");
    if (typeof body.address !== "string" || typeof body.appPassword !== "string") {
      return badRequest("Enter the mailbox address and app password.");
    }
    const input: ConnectInput = {
      provider: body.provider,
      address: body.address,
      fromName: typeof body.fromName === "string" ? body.fromName : "",
      appPassword: body.appPassword,
      smtpHost: typeof body.smtpHost === "string" ? body.smtpHost : undefined,
      smtpPort: body.smtpPort,
      imapHost: typeof body.imapHost === "string" ? body.imapHost : undefined,
      imapPort: body.imapPort,
      timezone: body.timezone,
    };
    const mailbox = await connectMailbox(user.id, input);
    return NextResponse.json({ mailbox });
  } catch (err) {
    if (err instanceof MailboxAuthError) return badRequest(err.message);
    return errorResponse(err);
  }
}
