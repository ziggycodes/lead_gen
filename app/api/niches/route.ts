import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/apiError";
import { ensureUser, isPremiumPlan } from "@/lib/users";
import { NICHES, listNicheKeys } from "@/src/niches.js";

const niches = NICHES as Record<string, { label: string; category: string }>;

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
      listNicheKeys().map((key: string) => ({
        key,
        label: niches[key].label,
        category: niches[key].category,
      }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}
