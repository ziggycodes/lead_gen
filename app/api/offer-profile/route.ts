import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { badRequest, errorResponse } from "@/lib/apiError";
import { db, schema } from "@/lib/db";
import { InsightError, aiAccess, cleanOfferProfile, readOfferProfile } from "@/lib/insights";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    const row = await db().query.users.findFirst({
      where: eq(schema.users.id, user.id),
      columns: { offerProfile: true },
    });
    return NextResponse.json({ ai: aiAccess(user.plan), offer: readOfferProfile(row?.offerProfile) });
  } catch (err) {
    return errorResponse(err);
  }
}

// Premium accounts can save their offer before the AI key is set up.
export async function PUT(req: NextRequest) {
  try {
    const user = await ensureUser();
    if (aiAccess(user.plan) === "premium_required") return badRequest("AI research is a premium feature.", 403);
    const offer = cleanOfferProfile(await req.json().catch(() => null));
    await db().update(schema.users).set({ offerProfile: offer }).where(eq(schema.users.id, user.id));
    return NextResponse.json({ offer });
  } catch (err) {
    if (err instanceof InsightError) return badRequest(err.message);
    return errorResponse(err);
  }
}
