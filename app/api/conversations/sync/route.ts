import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/apiError";
import { listThreads, syncAllMailboxes } from "@/lib/mail/sync";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const user = await ensureUser();
    const syncErrors = await syncAllMailboxes(user.id);
    const threads = await listThreads(user.id);
    return NextResponse.json({ threads, syncErrors });
  } catch (err) {
    return errorResponse(err);
  }
}
