import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse, parseIds } from "@/lib/apiError";
import { BULK_SEND_REQUESTED, inngest } from "@/lib/inngest/client";
import { MAX_BULK_RECIPIENTS, createBulkSend, listBulkSends, markBulkSendFailed } from "@/lib/mail/bulk";
import { MailboxAuthError } from "@/lib/mail/errors";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    return NextResponse.json({ sends: await listBulkSends(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const accountId = Number(body?.accountId);
    const templateId = Number(body?.templateId);
    if (!Number.isInteger(accountId) || accountId <= 0) return badRequest("Choose a mailbox.");
    if (!Number.isInteger(templateId) || templateId <= 0) return badRequest("Choose a template.");
    const leadIds = parseIds(body?.leadIds, MAX_BULK_RECIPIENTS);
    if (!leadIds) return badRequest(`Select between 1 and ${MAX_BULK_RECIPIENTS} leads.`);

    const send = await createBulkSend(user.id, { accountId, templateId, leadIds });
    if (send.status === "queued") {
      try {
        await inngest.send({
          name: BULK_SEND_REQUESTED,
          data: { bulkSendId: send.id, accountId: send.accountId, userId: user.id },
        });
      } catch (err) {
        await markBulkSendFailed(send.id);
        throw err;
      }
    }
    return NextResponse.json({ send });
  } catch (err) {
    if (err instanceof MailboxAuthError) return badRequest(err.message);
    return errorResponse(err);
  }
}
