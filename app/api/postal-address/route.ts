import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { badRequest, errorResponse } from "@/lib/apiError";
import { db, schema } from "@/lib/db";
import { normalizePostalAddress, postalAddressError } from "@/lib/mail/postalAddress";
import { postalAddressFor } from "@/lib/mail/unsubscribe";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureUser();
    return NextResponse.json({ postalAddress: await postalAddressFor(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => null);
    const postalAddress = normalizePostalAddress(body?.postalAddress);
    const problem = postalAddressError(postalAddress);
    if (problem) return badRequest(problem);
    await db().update(schema.users).set({ postalAddress }).where(eq(schema.users.id, user.id));
    return NextResponse.json({ postalAddress });
  } catch (err) {
    return errorResponse(err);
  }
}
