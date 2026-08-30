"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { MapPin, Phone, Sparkles } from "lucide-react";

const SEARCH_TEXT = "Dentists in Texas";

const LEAD = {
  name: "Bright Smile Dental",
  niche: "Dental Practice",
  state: "Texas",
  phone: "+1 512-555-0134",
  pain: "Missed calls during appointments mean lost bookings",
  pitch: "An AI receptionist that answers and books 24/7",
};

export function HeroAnimation() {
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "searching" | "result">("typing");

  useEffect(() => {
    if (phase !== "typing") return;

    if (typed.length < SEARCH_TEXT.length) {
      const timer = setTimeout(() => {
        setTyped(SEARCH_TEXT.slice(0, typed.length + 1));
      }, 70);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setPhase("searching"), 500);
    return () => clearTimeout(timer);
  }, [typed, phase]);

  useEffect(() => {
    if (phase !== "searching") return;

    const timer = setTimeout(() => setPhase("result"), 900);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "result") return;

    const timer = setTimeout(() => {
      setTyped("");
      setPhase("typing");
    }, 4500);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 rounded-3xl bg-accent/10 blur-2xl" aria-hidden />

      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-amber-400" />
          <div className="h-3 w-3 rounded-full bg-emerald-400" />
          <span className="ml-2 text-xs font-medium text-muted">LeadScout search</span>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel-2 px-4 py-3">
          <div className="min-h-5 flex-1 text-sm font-medium text-fg">
            {typed}
            {phase === "typing" && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="ml-0.5 inline-block h-4 w-0.5 bg-accent align-middle"
              />
            )}
          </div>
          <motion.button
            animate={phase === "searching" ? { scale: [1, 0.95, 1] } : {}}
            transition={{ duration: 0.3 }}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white"
          >
            {phase === "searching" ? "Searching..." : "Search"}
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {phase === "result" && (
            <motion.div
              key="lead-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="mt-4 rounded-2xl border border-line bg-panel p-4 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-fg">{LEAD.name}</p>
                  <p className="text-xs text-muted">
                    {LEAD.niche} · {LEAD.state}
                  </p>
                </div>
                <span className="rounded-full bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
                  New lead
                </span>
              </div>

              <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {LEAD.phone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Austin, TX
                </span>
              </div>

              <div className="space-y-2 rounded-xl bg-panel-2 p-3">
                <div>
                  <p className="text-xs font-medium text-muted">Likely pain point</p>
                  <p className="text-sm text-fg">{LEAD.pain}</p>
                </div>
                <div>
                  <p className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                    <Sparkles className="h-3.5 w-3.5" />
                    Pitch angle
                  </p>
                  <p className="text-sm font-medium text-accent">{LEAD.pitch}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
