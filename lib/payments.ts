import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { addCredits } from "./quota";
import { verifyTransaction } from "./paystack";

// Verify with Paystack and credit the user exactly once, no matter how many
// times this is called (callback page and webhook can both fire).
export async function settlePayment(reference: string): Promise<{
  ok: boolean;
  alreadySettled: boolean;
  credits?: number;
}> {
  const payment = await db().query.payments.findFirst({
    where: eq(schema.payments.reference, reference),
  });
  if (!payment) return { ok: false, alreadySettled: false };
  if (payment.status === "success") {
    return { ok: true, alreadySettled: true, credits: payment.credits };
  }

  const verification = await verifyTransaction(reference);
  if (verification.status !== "success" || verification.amountKobo < payment.amountKobo) {
    return { ok: false, alreadySettled: false };
  }

  // Atomically flip pending -> success; only the winner credits the balance.
  const updated = await db()
    .update(schema.payments)
    .set({ status: "success", paidAt: new Date() })
    .where(and(eq(schema.payments.reference, reference), eq(schema.payments.status, "pending")))
    .returning({ id: schema.payments.id });

  if (updated.length > 0) {
    await addCredits(payment.userId, payment.credits);
  }
  return { ok: true, alreadySettled: updated.length === 0, credits: payment.credits };
}
