"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { fetchOfferProfile, saveOfferProfile, type AiAccess, type OfferProfile } from "./crmApi";

const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-oat px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:bg-panel";

const EMPTY: OfferProfile = { offer: "", audience: "", proof: "", tone: "" };

// What the account sells. AI research uses it to tailor each lead's pitch.
// Premium only; shown before the API key is set so the offer is ready when AI turns on.
export function OfferProfileCard() {
  const [access, setAccess] = useState<AiAccess | null>(null);
  const [form, setForm] = useState<OfferProfile>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchOfferProfile()
      .then((json) => {
        setAccess(json.ai);
        if (json.offer) setForm(json.offer);
      })
      .catch(() => {});
  }, []);

  if (!access || access === "premium_required") return null;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { offer } = await saveOfferProfile(form);
      setForm(offer);
      setMessage({ ok: true, text: "Saved. New AI research will use this." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof OfferProfile, label: string, placeholder: string, rows = 2) => (
    <label className="block text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        rows={rows}
        className={`${fieldClass} resize-y`}
      />
    </label>
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-1.5 font-display text-base font-semibold">
          <Sparkles className="h-4 w-4" /> Your offer for AI research
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          AI research reads each lead&apos;s website and writes an opener, pain point, and pitch for this offer.
        </p>
        {access === "not_configured" && (
          <p className="mt-1 text-xs font-medium text-fg">
            AI research turns on once it&apos;s set up. Save your offer now and it will be used then.
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="max-w-2xl space-y-3 rounded-xl border border-line bg-panel px-4 py-4"
      >
        {field("offer", "What you sell", "AI receptionists that answer every call and book appointments into your calendar.", 3)}
        {field("audience", "Who you help", "Independent dental and med spa clinics with 1-5 locations.")}
        {field("proof", "Proof points you can back up", "Recovered 40+ missed bookings a month for a UK physio clinic.")}
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">Tone</span>
          <input
            value={form.tone}
            onChange={(e) => setForm({ ...form, tone: e.target.value })}
            placeholder="Direct, friendly, no hype"
            className={fieldClass}
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          {message && <span className={`text-xs ${message.ok ? "text-muted" : "text-danger"}`}>{message.text}</span>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save offer"}
          </button>
        </div>
      </form>
    </section>
  );
}
