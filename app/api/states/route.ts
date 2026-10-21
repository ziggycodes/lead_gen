import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/apiError";
import { ensureUser, isPremiumPlan } from "@/lib/users";
import { US_STATES, listStateIsoCodes } from "@/src/usStates.js";

const states = US_STATES as Record<string, string>;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    if (!isPremiumPlan(user.plan)) {
      return NextResponse.json(
        { error: "Choose niches and states with a premium account." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      listStateIsoCodes().map((iso: string) => ({ iso, name: states[iso] }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}
