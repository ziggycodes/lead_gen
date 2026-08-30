import Image from "next/image";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { Footer } from "@/components/Footer";
import { LandingBelowFold } from "@/components/landing/LandingBelowFold";

export default function LandingPage() {
  return (
    <>
      <main>
        {/* Full-bleed hero */}
        <section className="relative min-h-[100svh] overflow-hidden bg-ink">
          <MarketingHeader variant="overlay" />
          <Image
            src="/hero/hero-landscape.png"
            alt=""
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/35" aria-hidden />
          <div
            className="absolute inset-x-0 bottom-0 h-[55%] bg-black/45"
            aria-hidden
          />

          <div className="relative z-10 flex min-h-[100svh] flex-col justify-end px-5 pb-8 pt-24 sm:px-6 sm:pb-14 sm:pt-28 lg:pb-16">
            <div className="mx-auto grid w-full max-w-6xl gap-6 sm:gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:gap-12">
              <div>
                <p className="mb-3 font-display text-[11px] font-semibold tracking-[0.14em] text-accent uppercase sm:text-xs">
                  Latest · OpenStreetMap data →
                </p>
                <h1 className="font-display text-[2.35rem] leading-[1.05] font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-[4.25rem]">
                  Find leads ready for outreach
                </h1>
              </div>
              <div className="lg:pb-1">
                <p className="max-w-md text-[15px] leading-relaxed text-white/90 sm:text-lg">
                  Pick a niche and state. Get contacts, pain points, and pitch
                  angles you can send today.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-6">
                  <Link
                    href="/sign-up"
                    className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 sm:px-6 sm:py-3"
                  >
                    Start free →
                  </Link>
                  <Link
                    href="/pricing"
                    className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 sm:px-6 sm:py-3"
                  >
                    See pricing →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <LandingBelowFold />
      </main>
      <Footer />
    </>
  );
}
