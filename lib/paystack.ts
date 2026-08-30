import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set.");
  return key;
}

async function paystackFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const json = await res.json();
  if (!res.ok || !json.status) {
    throw new Error(`Paystack error: ${json.message || res.status}`);
  }
  return json.data;
}

export interface InitializeResult {
  authorizationUrl: string;
  reference: string;
}

export async function initializeTransaction(params: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializeResult> {
  const data = await paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      currency: "NGN",
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });
  return { authorizationUrl: data.authorization_url, reference: data.reference };
}

export interface VerifyResult {
  status: string; // "success" when paid
  amountKobo: number;
  reference: string;
  paidAt: string | null;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const data = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
  return {
    status: data.status,
    amountKobo: data.amount,
    reference: data.reference,
    paidAt: data.paid_at ?? null,
  };
}

// Paystack signs webhook bodies with HMAC-SHA512 using your secret key.
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
