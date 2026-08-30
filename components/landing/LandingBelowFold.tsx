"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { CREDIT_PACKS, formatNaira, FREE_TRIAL_LEADS } from "@/lib/plans";
import { Reveal } from "./Reveal";

const SAMPLE_ROWS = [
  {
    name: "Bright Smile Dental",
    niche: "Dental Practice",
    state: "Texas",
    phone: "+1 512-555-0134",
    pain: "Missed calls during appointments mean lost bookings",
    pitch: "An AI receptionist that answers and books 24/7",
  },
  {
    name: "Reyes Plumbing Co.",
    niche: "Plumber",
    state: "Florida",
    phone: "+1 305-555-0177",
    pain: "No website — relying on word of mouth only",
    pitch: "Capture emergency calls with instant response",
  },
  {
    name: "Luxe Hair Studio",
    niche: "Salon",
    state: "Georgia",
    phone: "+1 404-555-0126",
    pain: "Phone-only booking limits after-hours clients",
    pitch: "Automated booking assistant for busy stylists",
  },
];

const FAQS = [
  {
    q: "Where does the data come from?",
    a: "OpenStreetMap — a public, community-maintained map database. We only surface publicly listed business information.",
  },
  {
    q: "What are pain points and pitch angles?",
    a: "For every lead, LeadScout reads digital-presence signals (no website, phone-only, missing hours) and suggests the likely pain plus an outreach angle.",
  },
  {
    q: "What can I export?",
    a: "CSV and Excel (XLSX) — ready for your CRM, spreadsheet, or dialer.",
  },
  {
    q: "Is there a free tier?",
    a: `Yes. Every account gets ${FREE_TRIAL_LEADS} free leads. No card required. Packs start at ${formatNaira(CREDIT_PACKS.starter.amountKobo)}.`,
  },
  {
    q: "Who is LeadScout for?",
    a: "Freelancers, agencies, and SDRs who sell services to US businesses and need targeted prospect lists — fast.",
  },
];

const STEPS = [
  {
    n: "01",
    bg: "bg-accent",
    title: "Pick niche & states",
    body: "37 business types across all 50 US states.",
    parallax: 14,
  },
  {
    n: "02",
    bg: "bg-coral/80",
    title: "Get leads tagged",
    body: "Contacts plus pain points and pitch angles.",
    parallax: -12,
  },
  {
    n: "03",
    bg: "bg-oat",
    title: "Export & outreach",
    body: "CSV or Excel — straight into your stack.",
    parallax: 16,
  },
];

const CAPABILITIES = [
  {
    label: "Niches",
    title: "37 niches ready to search",
    body: "Medical, trades, beauty, food, auto, and professional services.",
    chip: "37 niches",
  },
  {
    label: "Coverage",
    title: "All 50 US states",
    body: "Target one state or the whole country in a single run.",
    chip: "50 states",
  },
  {
    label: "Outreach",
    title: "Pain points included",
    body: "Every lead ships with an angle you can send today.",
    chip: null,
  },
  {
    label: "Export",
    title: "Instant CSV & Excel",
    body: "One click into your CRM, dialer, or cold-email tool.",
    chip: null,
  },
];

function SampleResults() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const stageY = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? [0, 0] : [24, -24]
  );

  return (
    <section ref={sectionRef} className="relative overflow-hidden px-6 py-20 sm:py-24">
      <div className="relative mx-auto max-w-6xl">
        <Reveal className="mb-10 max-w-2xl">
          <p className="mb-2 font-display text-xs font-semibold tracking-[0.14em] text-muted uppercase">
            Sample results
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            See what every lead looks like
          </h2>
          <p className="mt-3 text-muted">
            Contact info plus outreach-ready insights — before you export.
          </p>
        </Reveal>

        <div className="relative">
          <motion.div
            style={{ y: stageY }}
            className="pointer-events-none absolute -inset-4 rounded-[2.5rem] bg-accent/25 sm:-inset-6 sm:rounded-[3rem]"
            aria-hidden
          />
          <motion.div
            style={{ y: stageY }}
            className="pointer-events-none absolute -inset-1 rounded-[2.25rem] bg-oat sm:-inset-2"
            aria-hidden
          />

          <Reveal delay={0.1} className="relative">
            <div className="overflow-hidden rounded-[2rem] border border-line bg-panel shadow-[0_24px_60px_-28px_rgba(20,20,20,0.25)]">
              <div className="flex items-center justify-between border-b border-line bg-oat px-5 py-3.5">
                <span className="text-sm font-medium text-muted">Sample output</span>
                <motion.span
                  className="rounded-full bg-accent/50 px-2.5 py-0.5 text-[11px] font-semibold text-ink"
                  initial={reduce ? false : { scale: 0.9, opacity: 0.6 }}
                  whileInView={reduce ? undefined : { scale: [0.9, 1.06, 1], opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
                >
                  3 leads
                </motion.span>
              </div>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-175 text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-oat/60 text-muted">
                      <th className="px-5 py-3 font-medium">Business</th>
                      <th className="px-5 py-3 font-medium">Niche</th>
                      <th className="px-5 py-3 font-medium">State</th>
                      <th className="px-5 py-3 font-medium">Phone</th>
                      <th className="px-5 py-3 font-medium">Likely pain point</th>
                      <th className="px-5 py-3 font-medium">Pitch angle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_ROWS.map((r, i) => (
                      <motion.tr
                        key={r.name}
                        className="group/row border-b border-line/60 last:border-0 hover:bg-oat/40"
                        initial={reduce ? false : { opacity: 0, y: 16 }}
                        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-5%" }}
                        transition={{
                          duration: 0.4,
                          delay: 0.15 + i * 0.1,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <td className="px-5 py-4 font-semibold text-fg">{r.name}</td>
                        <td className="px-5 py-4 text-muted">{r.niche}</td>
                        <td className="px-5 py-4 text-muted">{r.state}</td>
                        <td className="px-5 py-4 text-muted">{r.phone}</td>
                        <td className="px-5 py-4 text-muted">{r.pain}</td>
                        <td className="px-5 py-4 font-medium text-fg">
                          <span className="border-b border-transparent transition-colors group-hover/row:border-accent">
                            {r.pitch}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y0 = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [14, -14]);
  const y1 = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-12, 12]);
  const y2 = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [16, -16]);
  const ys = [y0, y1, y2];

  return (
    <section ref={sectionRef} className="border-y border-line bg-oat/50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <Reveal className="mb-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-muted">Three steps. Export ready.</p>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} style={{ y: ys[i] }}>
              <motion.div
                className={`rounded-[1.75rem] p-8 sm:p-9 ${s.bg}`}
                initial={reduce ? false : { opacity: 0, y: 32 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.12,
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={reduce ? undefined : { y: -4 }}
              >
                <span className="font-display text-sm font-semibold text-ink/50">
                  {s.n}
                </span>
                <h3 className="mt-5 font-display text-2xl font-semibold text-ink">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/70 sm:text-base">
                  {s.body}
                </p>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <Reveal className="mb-12 max-w-xl">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Build lists that close
        </h2>
        <p className="mt-3 text-muted">
          One search. Contacts, context, and a reason to reach out.
        </p>
      </Reveal>

      <div className="border-y border-line">
        {CAPABILITIES.map((c, i) => (
          <motion.div
            key={c.label}
            className="group border-b border-line last:border-b-0"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-8%" }}
            transition={{
              duration: 0.45,
              delay: i * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="grid gap-2 border-l-2 border-transparent py-8 pl-0 transition-colors group-hover:border-accent sm:grid-cols-[140px_1fr] sm:gap-8 sm:pl-4">
              <p className="font-display text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                <span className="inline-block rounded-sm px-1.5 py-0.5 transition-colors group-hover:bg-accent group-hover:text-ink">
                  {c.label}
                </span>
              </p>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-xl font-semibold text-fg sm:text-2xl">
                    {c.title}
                  </h3>
                  {c.chip && (
                    <span className="rounded-full bg-oat px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                      {c.chip}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 max-w-xl text-muted">{c.body}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function PricingCta() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const blobY = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? [0, 0] : [30, -30]
  );

  return (
    <section ref={sectionRef} className="relative mx-auto max-w-6xl px-6 pb-20 sm:pb-24">
      <motion.div
        style={{ y: blobY }}
        className="pointer-events-none absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/40 blur-3xl sm:h-80 sm:w-80"
        aria-hidden
      />

      <Reveal>
        <motion.div
          className="relative rounded-[2rem] bg-ink px-8 py-12 text-center sm:px-12 sm:py-16"
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mb-3 font-display text-xs font-semibold tracking-[0.14em] text-accent uppercase">
            No card required →
          </p>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Start free. Pay only when you need more.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">
            {FREE_TRIAL_LEADS} free leads on signup. Packs from{" "}
            <span className="font-semibold text-accent">
              {formatNaira(CREDIT_PACKS.starter.amountKobo)}
            </span>{" "}
            for {CREDIT_PACKS.starter.credits} leads. No subscription.
          </p>
          <Link
            href="/pricing"
            className="mt-8 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            View all packs →
          </Link>
        </motion.div>
      </Reveal>
    </section>
  );
}

function Faq() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-3xl px-6 pb-20 sm:pb-24">
      <Reveal>
        <h2 className="mb-8 text-center font-display text-3xl font-semibold tracking-tight text-fg">
          FAQ
        </h2>
      </Reveal>
      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <motion.details
            key={f.q}
            className="faq-item group rounded-2xl border border-line bg-panel p-5 open:shadow-sm"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-5%" }}
            transition={{
              duration: 0.4,
              delay: i * 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <summary className="cursor-pointer border-l-2 border-transparent pl-3 font-display font-semibold text-fg transition-colors marker:content-none hover:border-accent">
              {f.q}
            </summary>
            <p className="faq-answer mt-3 pl-3 text-sm leading-relaxed text-muted">
              {f.a}
            </p>
          </motion.details>
        ))}
      </div>
    </section>
  );
}

export function LandingBelowFold() {
  return (
    <>
      <SampleResults />
      <HowItWorks />
      <Capabilities />
      <PricingCta />
      <Faq />
    </>
  );
}
