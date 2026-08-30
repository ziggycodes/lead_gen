import { MarketingHeader } from "@/components/MarketingHeader";
import { Footer } from "@/components/Footer";
import { Brand } from "@/components/Brand";

export const metadata = {
  title: "Waitlist — LeadScout",
};

export default function WaitlistPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center sm:py-28">
        <div className="mb-8 scale-125">
          <Brand />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          LeadScout is Nigeria-only right now
        </h1>
        <p className="mt-4 text-muted">
          We&apos;re launching in Nigeria first and expanding soon. Want in when
          we open your country? Email us and we&apos;ll add you to the waitlist.
        </p>
        <a
          href="mailto:hello@leadscout.app?subject=Waitlist%20request"
          className="mt-8 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Join the waitlist →
        </a>
      </main>
      <Footer />
    </>
  );
}
