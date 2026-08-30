import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { Footer } from "@/components/Footer";
import { BuyPackButton } from "@/components/BuyPackButton";
import { CREDIT_PACKS, formatNaira, FREE_TRIAL_LEADS, DAILY_LEAD_CAP } from "@/lib/plans";

export const metadata = {
  title: "Pricing — LeadScout",
};

export default function PricingPage() {
  const packs = Object.values(CREDIT_PACKS);
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <h1 className="text-center font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Simple, pay-as-you-go pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-muted">
          Priced for Nigeria. Pay with Naira via Paystack. Credits never expire.
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-4">
          <div className="rounded-[1.75rem] border border-line bg-panel p-6">
            <h2 className="font-display font-semibold">Free</h2>
            <p className="mt-2 font-display text-3xl font-semibold">{"\u20a6"}0</p>
            <p className="mt-1 text-sm text-muted">{FREE_TRIAL_LEADS} leads on signup</p>
            <ul className="mt-5 space-y-2 text-sm text-muted">
              <li>All 37 niches, all 50 states</li>
              <li>Pain points + pitch angles</li>
              <li>CSV / Excel export</li>
              <li>No card required</li>
            </ul>
            <Link
              href="/sign-up"
              className="mt-6 block rounded-full border border-line bg-panel px-5 py-3 text-center text-sm font-semibold text-fg transition-colors hover:border-ink"
            >
              Start free
            </Link>
          </div>

          {packs.map((pack, i) => (
            <div
              key={pack.id}
              className={`rounded-[1.75rem] border p-6 ${
                i === 1
                  ? "border-ink bg-panel shadow-[0_20px_50px_-24px_rgba(20,20,20,0.35)]"
                  : "border-line bg-panel"
              }`}
            >
              {i === 1 && (
                <span className="mb-2 inline-block rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-ink">
                  Most popular
                </span>
              )}
              <h2 className="font-display font-semibold">{pack.name}</h2>
              <p className="mt-2 font-display text-3xl font-semibold">
                {formatNaira(pack.amountKobo)}
              </p>
              <p className="mt-1 text-sm text-muted">{pack.blurb}</p>
              <ul className="mt-5 space-y-2 text-sm text-muted">
                <li>{pack.credits.toLocaleString()} lead credits</li>
                <li>Credits never expire</li>
                <li>Everything in Free</li>
                <li>
                  {"\u20a6"}
                  {Math.round(pack.amountKobo / 100 / pack.credits)} per lead
                </li>
              </ul>
              <div className="mt-6">
                <BuyPackButton packId={pack.id} label={`Buy ${pack.name}`} />
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-[1.5rem] border border-line bg-oat p-6 text-sm text-muted">
          <h3 className="mb-2 font-display font-semibold text-fg">Fair-use limits</h3>
          <p>
            To keep the service fast and free data sources healthy, every account
            can generate up to {DAILY_LEAD_CAP} leads per day. Need more? Reach
            out and we&apos;ll sort you out.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
