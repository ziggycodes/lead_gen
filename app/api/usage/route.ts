import { NextResponse } from "next/server";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { getQuota } from "@/lib/quota";
import { FREE_TRIAL_LEADS, DAILY_LEAD_CAP } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    const quota = await getQuota(user.id);
    return NextResponse.json({
      quota,
      plan: user.plan,
      freeTrialLeads: FREE_TRIAL_LEADS,
      dailyCap: DAILY_LEAD_CAP,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
