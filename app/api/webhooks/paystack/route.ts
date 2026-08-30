import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paystack";
import { settlePayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event === "charge.success" && event.data?.reference) {
    try {
      await settlePayment(event.data.reference);
    } catch {
      // Return 200 anyway; Paystack retries, and the callback page also settles.
    }
  }

  return NextResponse.json({ received: true });
}
