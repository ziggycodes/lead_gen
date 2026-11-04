import { NextRequest, NextResponse } from "next/server";
import { logMailFailure } from "@/lib/mail/errors";
import { recordUnsubscribe } from "@/lib/mail/unsubscribe";
import { readUnsubscribeToken } from "@/lib/mail/unsubscribeToken";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

// Public: recipients have no LeadScout account. The encrypted token is the only
// authority, and it can only ever opt out the address it was issued for.
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params;
  const target = readUnsubscribeToken(token);
  if (!target) return new NextResponse("This unsubscribe link is not valid.", { status: 400 });

  try {
    await recordUnsubscribe(target.userId, target.email);
  } catch (err) {
    logMailFailure("unsubscribe_failed", err, { userId: target.userId });
    return new NextResponse("Could not unsubscribe. Please try again.", { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  if (form?.get("source") === "page") {
    return NextResponse.redirect(new URL(`/unsubscribe/${token}?done=1`, req.url), 303);
  }
  return new NextResponse("You have been unsubscribed.", { status: 200 });
}

// Security scanners open links in mail, so a GET must never unsubscribe anyone.
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(`/unsubscribe/${token}`, req.url), 303);
}
