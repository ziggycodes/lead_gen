import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { initializeTransaction } from "@/lib/paystack";
import { CREDIT_PACKS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    if (!user.email) {
      return NextResponse.json(
        { error: "Your account has no email address. Add one in your profile first." },
        { status: 400 }
      );
    }

    const { packId } = await req.json();
    const pack = CREDIT_PACKS[packId];
    if (!pack) {
      return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });
    }

    const reference = `ls_${Date.now()}_${randomBytes(6).toString("hex")}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    await db().insert(schema.payments).values({
      userId: user.id,
      reference,
      amountKobo: pack.amountKobo,
      credits: pack.credits,
      status: "pending",
    });

    const { authorizationUrl } = await initializeTransaction({
      email: user.email,
      amountKobo: pack.amountKobo,
      reference,
      callbackUrl: `${appUrl}/billing/callback`,
      metadata: { userId: user.id, packId: pack.id, credits: pack.credits },
    });

    return NextResponse.json({ authorizationUrl, reference });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
