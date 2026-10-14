import { NextResponse } from "next/server";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { getUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    const usage = await getUsage(user.id);
    return NextResponse.json({ usage, plan: user.plan });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
