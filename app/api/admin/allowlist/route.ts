import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { adminEmails, isAdminEmail, normalizeEmail } from "@/lib/access";
import { badRequest, errorResponse } from "@/lib/apiError";
import { db, schema } from "@/lib/db";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/users";

export const dynamic = "force-dynamic";

function logFailure(err: unknown) {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return;
  console.error(
    JSON.stringify({
      event: "allowlist_failed",
      name: err instanceof Error ? err.name : "Error",
    })
  );
}

export async function GET() {
  try {
    await requireAdmin();
    const emails = await db()
      .select({
        email: schema.allowedEmails.email,
        createdAt: schema.allowedEmails.createdAt,
      })
      .from(schema.allowedEmails)
      .orderBy(asc(schema.allowedEmails.createdAt));
    return NextResponse.json({ admins: adminEmails(), emails });
  } catch (err) {
    logFailure(err);
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null);
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : null);
    if (!email) return badRequest("Enter a valid email address.");
    if (isAdminEmail(email)) return badRequest("That email can already sign in.");

    await db()
      .insert(schema.allowedEmails)
      .values({ email })
      .onConflictDoNothing({ target: schema.allowedEmails.email });

    console.info(JSON.stringify({ event: "allowlist_add" }));
    return NextResponse.json({ email });
  } catch (err) {
    logFailure(err);
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null);
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : null);
    if (!email) return badRequest("Enter a valid email address.");

    await db().delete(schema.allowedEmails).where(eq(schema.allowedEmails.email, email));
    console.info(JSON.stringify({ event: "allowlist_remove" }));
    return NextResponse.json({ email });
  } catch (err) {
    logFailure(err);
    return errorResponse(err);
  }
}
