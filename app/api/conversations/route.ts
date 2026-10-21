import { NextRequest, NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/apiError";
import { listThreads, threadMessages } from "@/lib/mail/sync";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await ensureUser();
    const address = req.nextUrl.searchParams.get("address");
    if (address) {
      const thread = await threadMessages(user.id, address);
      if (!thread) return badRequest("That address is not a conversation.");
      return NextResponse.json(thread);
    }
    const threads = await listThreads(user.id);
    return NextResponse.json({ threads });
  } catch (err) {
    return errorResponse(err);
  }
}
