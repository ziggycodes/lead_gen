"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, LoaderCircle, MapPin, Plus, Search, X } from "lucide-react";
import type { SearchJob } from "./types";
import type { SearchInput } from "./useSearchJob";

interface Niche {
  key: string;
  label: string;
  category: string;
}
interface StateOpt {
  iso: string;
  name: string;
}

export interface FindPrefill {
  niches: string;
  states: string;
  limit?: number;
}

const DEFAULT_NICHES = ["dentist", "salon", "plumber", "restaurant"];

// The search itself runs on the server (see useSearchJob). This sheet picks what
// to search and shows progress; closing it or leaving the page loses nothing.
export function FindSheet({
  open,
  onOpen,
  prefill,
  prefillKey,
  onClose,
  job,
  running,
  onStart,
  onStop,
}: {
  open: boolean;
  onOpen: () => void;
  prefill: FindPrefill | null;
  prefillKey: number;
  onClose: () => void;
  job: SearchJob | null;
  running: boolean;
  onStart: (input: SearchInput) => Promise<string | null>;
  onStop: () => void;
}) {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [states, setStates] = useState<StateOpt[]>([]);
  const [selectedNiches, setSelectedNiches] = useState<Set<string>>(new Set(DEFAULT_NICHES));
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(50);
  const [nicheQuery, setNicheQuery] = useState("");
  const [stateQuery, setStateQuery] = useState("");
  const [nichePickerOpen, setNichePickerOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load your account."))))
      .then(async (json) => {
        if (cancelled) return;
        const isPremium = json.plan === "premium";
        setPremium(isPremium);
        if (!isPremium) return;
        const [nichesRes, statesRes] = await Promise.all([fetch("/api/niches"), fetch("/api/states")]);
        if (!nichesRes.ok || !statesRes.ok) throw new Error("Could not load niches and states.");
        const [n, s] = await Promise.all([nichesRes.json(), statesRes.json()]);
        if (cancelled) return;
        setNiches(n);
        setStates(s);
      })
      .catch((err: Error) => {
        if (!cancelled) setAccountError(err.message || "Could not load your account.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefill) return;
    const nextNiches = prefill.niches.split(",").map((s) => s.trim()).filter(Boolean);
    if (nextNiches.length) setSelectedNiches(new Set(nextNiches));
    const rawStates = (prefill.states || "US").split(",").map((s) => s.trim()).filter(Boolean);
    const narrowed = rawStates.filter((s) => s && s !== "US");
    setSelectedStates(new Set(narrowed));
    if (prefill.limit && prefill.limit > 0) setLimit(prefill.limit);
  }, [prefill, prefillKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const nicheByKey = useMemo(() => {
    const map = new Map<string, Niche>();
    for (const n of niches) map.set(n.key, n);
    return map;
  }, [niches]);
  const stateByIso = useMemo(() => {
    const map = new Map<string, StateOpt>();
    for (const s of states) map.set(s.iso, s);
    return map;
  }, [states]);

  const availableNiches = useMemo(() => {
    const q = nicheQuery.trim().toLowerCase();
    return niches.filter((n) => {
      if (selectedNiches.has(n.key)) return false;
      if (!q) return true;
      return n.label.toLowerCase().includes(q) || n.key.toLowerCase().includes(q);
    });
  }, [niches, selectedNiches, nicheQuery]);

  const availableStates = useMemo(() => {
    const q = stateQuery.trim().toLowerCase();
    return states.filter((s) => {
      if (selectedStates.has(s.iso)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.iso.toLowerCase().includes(q);
    });
  }, [states, selectedStates, stateQuery]);

  async function run() {
    if (premium === null || running || starting) return;
    if (premium && selectedNiches.size === 0) {
      setError("Pick at least one niche.");
      return;
    }
    setError(null);
    setStarting(true);
    const input: SearchInput = premium
      ? {
          niches: Array.from(selectedNiches).join(","),
          states: selectedStates.size ? Array.from(selectedStates).join(",") : "US",
          limit,
        }
      : {};
    const message = await onStart(input);
    setStarting(false);
    if (message) setError(message);
  }

  const progress = running && job ? job.progress : null;
  const statusLine = !progress
    ? ""
    : job?.status === "queued"
      ? "Starting search…"
      : job?.params?.stateLabel
        ? `A mix of businesses in ${job.params.stateLabel}.`
        : progress.statusLine || "Searching…";
  const progressPct = progress
    ? Math.min(100, Math.round((progress.step / Math.max(progress.totalSteps, 1)) * 100))
    : 0;

  const picker = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted">Niches</p>
        <div className="flex flex-wrap items-center gap-2">
          {Array.from(selectedNiches).map((key) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white"
            >
              {nicheByKey.get(key)?.label || key}
              <button
                onClick={() =>
                  setSelectedNiches((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                  })
                }
                aria-label={`Remove ${key}`}
                className="rounded-full p-0.5 opacity-70 hover:bg-white/15 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="relative">
            <button
              onClick={() => {
                setNichePickerOpen((o) => !o);
                setStatePickerOpen(false);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted hover:text-fg"
            >
              <Plus className="h-3 w-3" />
              Niche
            </button>
            {nichePickerOpen && (
              <div className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-lg">
                <div className="border-b border-line p-2">
                  <input
                    autoFocus
                    value={nicheQuery}
                    onChange={(e) => setNicheQuery(e.target.value)}
                    placeholder="Search niches"
                    className="w-full rounded-lg bg-oat px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <ul className="scroll-thin max-h-48 overflow-y-auto py-1">
                  {availableNiches.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-muted">No niches left</li>
                  ) : (
                    availableNiches.map((n) => (
                      <li key={n.key}>
                        <button
                          onClick={() => {
                            setSelectedNiches((prev) => new Set(prev).add(n.key));
                            setNichePickerOpen(false);
                            setNicheQuery("");
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-oat"
                        >
                          {n.label}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">States</p>
        <div className="flex flex-wrap items-center gap-2">
          {selectedStates.size === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-oat px-2.5 py-1 text-xs font-medium text-muted">
              <MapPin className="h-3 w-3" />
              All US states
            </span>
          ) : (
            Array.from(selectedStates).map((iso) => (
              <span
                key={iso}
                className="inline-flex items-center gap-1 rounded-full bg-oat px-2.5 py-1 text-xs font-medium text-fg"
              >
                {stateByIso.get(iso)?.name || iso}
                <button
                  onClick={() =>
                    setSelectedStates((prev) => {
                      const next = new Set(prev);
                      next.delete(iso);
                      return next;
                    })
                  }
                  aria-label={`Remove ${iso}`}
                  className="rounded-full p-0.5 text-muted hover:text-fg"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
          <div className="relative">
            <button
              onClick={() => {
                setStatePickerOpen((o) => !o);
                setNichePickerOpen(false);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted hover:text-fg"
            >
              <Plus className="h-3 w-3" />
              State
            </button>
            {statePickerOpen && (
              <div className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-lg">
                <div className="border-b border-line p-2">
                  <input
                    autoFocus
                    value={stateQuery}
                    onChange={(e) => setStateQuery(e.target.value)}
                    placeholder="Search states"
                    className="w-full rounded-lg bg-oat px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <ul className="scroll-thin max-h-48 overflow-y-auto py-1">
                  {availableStates.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-muted">No states left</li>
                  ) : (
                    availableStates.map((s) => (
                      <li key={s.iso}>
                        <button
                          onClick={() => {
                            setSelectedStates((prev) => new Set(prev).add(s.iso));
                            setStatePickerOpen(false);
                            setStateQuery("");
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-oat"
                        >
                          {s.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        Max
        <input
          type="number"
          min={1}
          value={limit}
          onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-20 rounded-full border border-line bg-oat px-2.5 py-1.5 text-center text-sm font-semibold text-fg outline-none focus:border-accent"
        />
      </label>
    </div>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40">
          <button className="absolute inset-0 bg-ink/40" aria-label="Close find" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 flex w-full max-w-md flex-col border-r border-line bg-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-tight">Find leads</h2>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-oat hover:text-fg"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
              {premium === null && !accountError ? <p className="text-sm text-muted">Loading…</p> : null}
              {accountError ? <p className="text-sm text-danger">{accountError}</p> : null}
              {premium === false ? (
                <p className="max-w-sm text-sm text-muted">
                  Find leads looks through a mix of business types in one US state. You can bring in 20 leads a day.
                </p>
              ) : null}
              {premium ? picker : null}
            </div>
            <div className="space-y-3 border-t border-line px-5 py-4">
              {progress && (
                <div>
                  <div className="mb-1 flex justify-between gap-3 text-xs text-muted">
                    <span className="min-w-0 truncate">{statusLine}</span>
                    <span className="shrink-0">{progress.saved} saved</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-500"
                      style={{ width: `${Math.max(progressPct, 4)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    You can close this panel or leave the page. Leads are saved as they are found.
                  </p>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{error}</div>
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={onStop}
                  disabled={!running}
                  className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:text-danger disabled:opacity-0"
                >
                  Stop
                </button>
                <button
                  onClick={run}
                  disabled={running || starting || premium === null || Boolean(accountError)}
                  className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
                >
                  {running || starting ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {running || starting ? "Searching" : "Find leads"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!open && running && (
        <button
          onClick={onOpen}
          className="fixed bottom-4 left-4 z-30 flex max-w-sm items-center gap-3 rounded-full border border-line bg-panel px-4 py-2 text-sm shadow-lg"
        >
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          <span className="truncate text-fg">
            Searching… {progress ? `${progress.saved} saved` : ""}
          </span>
        </button>
      )}
    </>
  );
}
