import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { settlePayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function BillingCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = params.reference || params.trxref;

  let ok = false;
  let credits: number | undefined;
  if (reference) {
    try {
      const result = await settlePayment(reference);
      ok = result.ok;
      credits = result.credits;
    } catch {
      ok = false;
    }
  }

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
        {ok ? (
          <>
            <span className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-mint/20 text-3xl">
              &#10003;
            </span>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Payment successful</h1>
            <p className="mt-4 text-muted">
              {credits?.toLocaleString()} lead credits have been added to your balance.
            </p>
            <Link
              href="/app"
              className="mt-8 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Back to dashboard
            </Link>
          </>
        ) : (
          <>
            <span className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-danger/20 text-3xl">
              &#10007;
            </span>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Payment not confirmed</h1>
            <p className="mt-4 text-muted">
              We couldn&apos;t confirm this payment yet. If you were charged, your credits will
              arrive automatically within a few minutes - or contact support with your
              reference: <span className="font-mono text-fg">{reference || "unknown"}</span>
            </p>
            <Link
              href="/pricing"
              className="mt-8 rounded-full border border-line px-6 py-3 text-sm font-semibold hover:border-ink"
            >
              Back to pricing
            </Link>
          </>
        )}
      </main>
    </>
  );
}
