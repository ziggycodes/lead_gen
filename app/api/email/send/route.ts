import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { MailboxAuthError, SendLimitError } from "@/lib/mail/errors";
import { sendFromMailbox } from "@/lib/mail/send";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Missing message.");
    const accountId = Number(body.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) return badRequest("Choose a mailbox.");
    if (typeof body.to !== "string" || typeof body.subject !== "string" || typeof body.body !== "string") {
      return badRequest("Add a recipient, subject, and message.");
    }
    const leadId = body.leadId == null ? null : Number(body.leadId);
    if (leadId != null && (!Number.isInteger(leadId) || leadId <= 0)) return badRequest("Lead not found.");

    const message = await sendFromMailbox(user.id, {
      accountId,
      to: body.to,
      subject: body.subject,
      body: body.body,
      leadId,
    });
    return NextResponse.json({ message });
  } catch (err) {
    if (err instanceof SendLimitError) return badRequest(err.message, 429);
    if (err instanceof MailboxAuthError) return badRequest(err.message);
    return errorResponse(err);
  }
}
