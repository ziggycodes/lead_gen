import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/users";
import { errorResponse } from "@/lib/apiError";
import { getUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    const usage = await getUsage(user.id);
    return NextResponse.json({ usage, plan: user.plan });
  } catch (err) {
    return errorResponse(err);
  }
}
