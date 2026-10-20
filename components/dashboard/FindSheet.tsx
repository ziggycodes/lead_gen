"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, MapPin, Plus, Search, X } from "lucide-react";
import { importLeads } from "./crmApi";
import type { Lead, SearchHistoryItem, Usage } from "./types";

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

export type SearchArrival = {
  found: number;
  inserted: number;
  searchId: number | null;
  stopped: boolean;
  finished: boolean;
};

export function searchSummary(arrival: Pick<SearchArrival, "found" | "inserted" | "stopped">): string {
  if (arrival.stopped && arrival.found === 0) return "Search stopped. Nothing new was added.";
  if (arrival.stopped) {
    const added = arrival.inserted === 1 ? "1 new lead" : `${arrival.inserted} new leads`;
    return arrival.inserted > 0
      ? `Search stopped. ${added} added from ${arrival.found} found.`
      : `Search stopped. ${arrival.found} found, already in your CRM.`;
  }
  if (arrival.found === 0) return "Search finished. No contactable businesses this time.";
  if (arrival.inserted === 0) {
    return `Search finished. ${arrival.found} found, already in your CRM.`;
  }
  if (arrival.inserted === arrival.found) {
    return arrival.inserted === 1
      ? "Search finished. 1 new lead added."
      : `Search finished. ${arrival.inserted} new leads added.`;
  }
  return `Search finished. ${arrival.inserted} new of ${arrival.found} found. The rest were already in your CRM.`;
}

export function FindSheet({
  open,
  onOpen,
  prefill,
  prefillKey,
  onClose,
  onUsage,
  onImported,
  onArrival,
  onFinished,
}: {
  open: boolean;
  onOpen: () => void;
  prefill: FindPrefill | null;
  prefillKey: number;
  onClose: () => void;
  onUsage: (usage: Usage) => void;
  onImported: () => void;
  onArrival: (arrival: SearchArrival) => void;
  onFinished: () => void;
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
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ step: number; totalSteps: number; total: number } | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchArrival | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chainRef = useRef(Promise.resolve());
  const searchIdRef = useRef<number | null>(null);
  const searchIdReady = useRef<Promise<number | null>>(Promise.resolve(null));
  const insertedRef = useRef(0);
  const foundRef = useRef(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/niches").then((r) => r.json()),
      fetch("/api/states").then((r) => r.json()),
    ])
      .then(([n, s]) => {
        setNiches(n);
        setStates(s);
      })
      .catch(() => {});
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
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, running, onClose]);

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

  const enqueue = (batch: Lead[]) => {
    if (!batch.length) return;
    chainRef.current = chainRef.current
      .then(async () => {
        if (searchIdRef.current == null) searchIdRef.current = await searchIdReady.current;
        const json = await importLeads(batch, searchIdRef.current);
        insertedRef.current += json.inserted;
        onArrival({
          found: foundRef.current,
          inserted: insertedRef.current,
          searchId: searchIdRef.current,
          stopped: false,
          finished: false,
        });
        onImported();
      })
      .catch((err: Error) => setError(err.message));
  };

  async function run() {
    if (selectedNiches.size === 0) {
      setError("Pick at least one niche.");
      return;
    }
    setError(null);
    setResult(null);
    setProgress(null);
    setStatusLine("Starting search…");
    setRunning(true);
    insertedRef.current = 0;
    foundRef.current = 0;
    onArrival({ found: 0, inserted: 0, searchId: null, stopped: false, finished: false });
    searchIdRef.current = null;
    searchIdReady.current = Promise.resolve(null);
    chainRef.current = Promise.resolve();

    const nicheParam = Array.from(selectedNiches).join(",");
    const stateParam = selectedStates.size ? Array.from(selectedStates).join(",") : "US";
    const params = new URLSearchParams({
      niches: nicheParam,
      states: stateParam,
      limit: String(limit),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    let stopped = false;
    let failed = false;

    try {
      const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Search failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response stream.");

      searchIdReady.current = fetch("/api/searches")
        .then((r) => (r.ok ? r.json() : { searches: [] }))
        .then((json) => {
          const runningSearch = ((json.searches || []) as SearchHistoryItem[]).find(
            (s) => s.status === "running"
          );
          return runningSearch?.id ?? null;
        })
        .catch(() => null);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (event: string, data: Record<string, unknown>) => {
        if (event === "progress") {
          const p = data as { step: number; totalSteps: number; total: number };
          setProgress(p);
          setStatusLine(`Step ${p.step} of ${p.totalSteps} · ${p.total} leads`);
        } else if (event === "leads") {
          const batch = (data.leads as Lead[]) || [];
          foundRef.current += batch.length;
          enqueue(batch);
        } else if (event === "contact") {
          setStatusLine(`Reading websites… ${data.done}/${data.total}`);
        } else if (event === "decision") {
          setStatusLine(`Looking up decision makers… ${data.done}/${data.total}`);
        } else if (event === "done") {
          if (typeof data.searchId === "number") searchIdRef.current = data.searchId;
          const summary = data.summary as { total?: number } | undefined;
          const finishedLeads = (data.leads as Lead[]) || [];
          foundRef.current = typeof summary?.total === "number" ? summary.total : finishedLeads.length;
          if (data.usage) onUsage(data.usage as Usage);
          enqueue(finishedLeads);
        } else if (event === "error") {
          failed = true;
          setError(String(data.message));
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const eventMatch = chunk.match(/^event: (.+)$/m);
          const dataMatch = chunk.match(/^data: (.+)$/m);
          if (eventMatch && dataMatch) {
            try {
              handleEvent(eventMatch[1], JSON.parse(dataMatch[1]));
            } catch {
              /* skip malformed chunk */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        stopped = true;
      } else {
        failed = true;
        setError((err as Error).message);
      }
    } finally {
      const wasStopped = stopped;
      const wasFailed = failed;
      chainRef.current = chainRef.current.finally(() => {
        const outcome: SearchArrival = {
          found: foundRef.current,
          inserted: insertedRef.current,
          searchId: searchIdRef.current,
          stopped: wasStopped,
          finished: true,
        };
        setRunning(false);
        abortRef.current = null;
        setProgress(null);
        setStatusLine("");
        if (wasFailed && outcome.found === 0 && outcome.inserted === 0) {
          setResult(null);
        } else {
          setResult(outcome);
          onArrival(outcome);
        }
        onFinished();
      });
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

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
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{picker}</div>
            <div className="space-y-3 border-t border-line px-5 py-4">
              {progress && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>{statusLine}</span>
                    <span>{progress.total} leads</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}
              {!progress && statusLine && <p className="text-xs text-muted">{statusLine}</p>}
              {result && !running && (
                <div className="flex items-start gap-2 rounded-xl bg-accent/25 px-3 py-2.5 text-sm text-ink">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{searchSummary(result)}</p>
                    {result.searchId != null && result.inserted > 0 && (
                      <p className="mt-0.5 text-xs text-ink/70">They are in the list. Close this panel to work them.</p>
                    )}
                  </div>
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
                  onClick={stop}
                  disabled={!running}
                  className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:text-danger disabled:opacity-0"
                >
                  Stop
                </button>
                <button
                  onClick={run}
                  disabled={running}
                  className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
                >
                  {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {running ? "Searching" : "Find leads"}
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
          <span className="truncate text-fg">{statusLine || "Searching…"}</span>
        </button>
      )}

      {!open && !running && result && (
        <div className="fixed bottom-4 left-4 z-30 flex max-w-sm items-center gap-3 rounded-full border border-accent bg-panel px-4 py-2 text-sm shadow-lg">
          <Check className="h-4 w-4 shrink-0 text-accent" />
          <button onClick={onOpen} className="truncate text-left font-medium text-fg">
            {searchSummary(result)}
          </button>
          <button
            onClick={() => setResult(null)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:bg-oat hover:text-fg"
            aria-label="Dismiss search result"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
