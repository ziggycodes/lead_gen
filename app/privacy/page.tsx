import { MarketingHeader } from "@/components/MarketingHeader";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Privacy Policy - LeadScout",
};

export default function PrivacyPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="mb-2 font-semibold text-fg">What we store</h2>
            <p>
              Your account email (via our auth provider, Clerk), your search parameters and
              results, and your usage/credit balance. Payment card details are handled entirely
              by Paystack - we never see or store them.
            </p>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-fg">What we don&apos;t do</h2>
            <p>
              We don&apos;t sell your data, and we don&apos;t share your searches or exports
              with anyone.
            </p>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-fg">Business data in results</h2>
            <p>
              Lead results contain publicly listed business information sourced from
              OpenStreetMap under its open license.
            </p>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-fg">Deletion</h2>
            <p>
              Delete your account and we remove your stored searches, usage records, and
              profile. Email support if you want this done manually.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
