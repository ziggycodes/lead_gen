import { MarketingHeader } from "@/components/MarketingHeader";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Terms of Service - LeadScout",
};

export default function TermsPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="mb-2 font-semibold text-fg">1. The service</h2>
            <p>
              LeadScout surfaces publicly available business information from OpenStreetMap and
              adds heuristic suggestions (pain points, pitch angles) to help you plan outreach.
              Data accuracy is not guaranteed - listings are community-maintained.
            </p>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-fg">2. Acceptable use</h2>
            <p>
              You are solely responsible for how you contact the businesses in your exports,
              including compliance with applicable outreach laws in your target market (e.g.
              CAN-SPAM and TCPA in the United States). Spam, harassment, and unlawful use are
              prohibited and will result in account termination.
            </p>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-fg">3. Accounts and quotas</h2>
            <p>
              Free accounts receive a one-time trial allowance. Credit packs add to your
              balance and do not expire. Daily generation limits apply to all accounts to
              protect upstream data sources. Creating multiple accounts to farm free credits is
              prohibited.
            </p>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-fg">4. Payments</h2>
            <p>
              Payments are processed by Paystack in Nigerian Naira. Credits are delivered
              automatically after successful payment. If a payment succeeds but credits do not
              appear within a few minutes, contact support and we will resolve it.
            </p>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-fg">5. Liability</h2>
            <p>
              The service is provided &quot;as is&quot; without warranties. We are not liable
              for outcomes of your outreach or for temporary unavailability of upstream data
              sources.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
