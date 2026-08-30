"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  Search,
  MapPin,
  Download,
  LoaderCircle,
  X,
  Sparkles,
  Globe,
  Phone,
  CreditCard,
  FileSpreadsheet,
  FileText,
  ListFilter,
  CircleAlert,
  Star,
  Clipboard,
  Check,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  Plus,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { leadKey } from "@/lib/leadKey";
import type { Lead } from "./types";
import { ResultsCharts } from "./ResultsCharts";
import { LeadDrawer } from "./LeadDrawer";
import { RecentSearches } from "./RecentSearches";

interface Niche {
  key: string;
  label: string;
  category: string;
}
interface StateOpt {
  iso: string;
  name: string;
}
interface Quota {
  balance: number;
  reserved: number;
  consumedToday: number;
  dailyRemaining: number;
  available: number;
}

type SortKey = "name" | "niche" | "state" | "city";
type SortDir = "asc" | "desc";

const DEFAULT_NICHES = ["dentist", "salon", "plumber", "restaurant"];

export function Dashboard() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [states, setStates] = useState<StateOpt[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);

  const [selectedNiches, setSelectedNiches] = useState<Set<string>>(new Set(DEFAULT_NICHES));
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(50);

  const [nicheQuery, setNicheQuery] = useState("");
  const [stateQuery, setStateQuery] = useState("");
  const [nichePickerOpen, setNichePickerOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const nichePickerRef = useRef<HTMLDivElement | null>(null);
  const statePickerRef = useRef<HTMLDivElement | null>(null);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ step: number; totalSteps: number; total: number; limit: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [filter, setFilter] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        const json = await res.json();
        setQuota(json.quota);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [n, s] = await Promise.all([
        fetch("/api/niches").then((r) => r.json()),
        fetch("/api/states").then((r) => r.json()),
      ]);
      setNiches(n);
      setStates(s);
    })();
    refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/saved-leads");
        if (res.ok) {
          const json = await res.json();
          setSavedKeys(new Set<string>(json.keys || []));
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (nichePickerOpen && nichePickerRef.current && !nichePickerRef.current.contains(t)) {
        setNichePickerOpen(false);
        setNicheQuery("");
      }
      if (statePickerOpen && statePickerRef.current && !statePickerRef.current.contains(t)) {
        setStatePickerOpen(false);
        setStateQuery("");
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [nichePickerOpen, statePickerOpen]);

  const addNiche = (key: string) => {
    setSelectedNiches((prev) => new Set(prev).add(key));
    setNichePickerOpen(false);
    setNicheQuery("");
  };

  const removeNiche = (key: string) => {
    setSelectedNiches((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const addState = (iso: string) => {
    setSelectedStates((prev) => new Set(prev).add(iso));
    setStatePickerOpen(false);
    setStateQuery("");
  };

  const removeState = (iso: string) => {
    setSelectedStates((prev) => {
      const next = new Set(prev);
      next.delete(iso);
      return next;
    });
  };

  const toggleSave = useCallback(
    async (lead: Lead) => {
      const key = leadKey(lead);
      const wasSaved = savedKeys.has(key);
      setSavedKeys((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(key);
        else next.add(key);
        return next;
      });
      try {
        if (wasSaved) {
          await fetch(`/api/saved-leads?key=${encodeURIComponent(key)}`, { method: "DELETE" });
        } else {
          await fetch("/api/saved-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead }),
          });
        }
      } catch {
        setSavedKeys((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(key);
          else next.delete(key);
          return next;
        });
      }
    },
    [savedKeys]
  );

  async function run() {
    if (selectedNiches.size === 0) {
      setError("Pick at least one niche.");
      return;
    }
    setError(null);
    setQuotaBlocked(false);
    setLeads([]);
    setLogs([]);
    setProgress(null);
    setActiveSearchId(null);
    setRunning(true);

    const params = new URLSearchParams({
      niches: Array.from(selectedNiches).join(","),
      states: selectedStates.size ? Array.from(selectedStates).join(",") : "US",
      limit: String(limit),
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/search?${params}`, { signal: controller.signal });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 402) setQuotaBlocked(true);
        throw new Error(json.error || `Search failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response stream.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (event: string, data: Record<string, unknown>) => {
        if (event === "log") {
          setLogs((prev) => [...prev.slice(-499), String(data.msg)]);
        } else if (event === "progress") {
          setProgress(data as { step: number; totalSteps: number; total: number; limit: number });
        } else if (event === "done") {
          setLeads((data.leads as Lead[]) || []);
          if (data.quota) setQuota(data.quota as Quota);
          if (typeof data.searchId === "number") setActiveSearchId(data.searchId);
        } else if (event === "error") {
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
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
      refreshUsage();
      setHistoryRefreshKey((k) => k + 1);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  const loadSearch = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/searches?id=${id}`);
      if (res.ok) {
        const json = await res.json();
        setLeads((json.leads as Lead[]) || []);
        setActiveSearchId(id);
        setError(null);
        setFilter("");
        setHistoryOpen(false);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const copyAll = useCallback(async () => {
    const cols = ["Business", "Niche", "State", "City", "Phone", "Website", "Email", "Pain Point", "Pitch Angle"];
    const rows = filteredAndSortedLeadsRef.current.map((l) =>
      [l.name, l.niche, l.state, l.city, l.phone, l.website, l.email, l.painPoint, l.pitchAngle].join("\t")
    );
    try {
      await navigator.clipboard.writeText([cols.join("\t"), ...rows].join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredLeads = useMemo(() => {
    if (!filter.trim()) return leads;
    const q = filter.toLowerCase();
    return leads.filter((l) =>
      [l.name, l.niche, l.state, l.city, l.phone, l.painPoint]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [leads, filter]);

  const filteredAndSortedLeads = useMemo(() => {
    if (!sortKey) return filteredLeads;
    const arr = [...filteredLeads];
    arr.sort((a, b) => {
      const av = (a[sortKey] || "").toString().toLowerCase();
      const bv = (b[sortKey] || "").toString().toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredLeads, sortKey, sortDir]);

  const filteredAndSortedLeadsRef = useRef<Lead[]>([]);
  filteredAndSortedLeadsRef.current = filteredAndSortedLeads;

  const stats = useMemo(() => {
    const withPhone = leads.filter((l) => l.phone).length;
    const withWebsite = leads.filter((l) => l.website).length;
    return { total: leads.length, withPhone, withWebsite };
  }, [leads]);

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

  const available = quota?.available ?? 0;
  const effectiveLimit = Math.min(limit, Math.max(available, 0));
  const progressPct = progress
    ? Math.min(100, Math.round((progress.step / Math.max(progress.totalSteps, 1)) * 100))
    : 0;

  const columns: { label: string; key?: SortKey }[] = [
    { label: "Business", key: "name" },
    { label: "Niche", key: "niche" },
    { label: "State", key: "state" },
    { label: "City", key: "city" },
    { label: "Phone" },
    { label: "Website" },
    { label: "Likely Pain Point" },
    { label: "Pitch Angle" },
  ];

  const emptyMessage = running
    ? "Searching OpenStreetMap… results appear when the run completes."
    : leads.length > 0
      ? "No leads match your filter."
      : "Pick niches, optionally narrow by state, then hit Find leads.";

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-[#faf9f6]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Brand href="/app" />
          <div className="flex items-center gap-3">
            {quota && (
              <div className="hidden items-center gap-3 rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm sm:flex">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-muted" />
                  <span className="font-semibold text-fg">{quota.balance}</span>
                  <span className="text-muted">credits</span>
                </span>
                <span className="h-3.5 w-px bg-line" />
                <span className="text-muted">
                  <span className="font-semibold text-fg">{quota.dailyRemaining}</span> today
                </span>
                {stats.total > 0 && (
                  <>
                    <span className="h-3.5 w-px bg-line" />
                    <span className="text-muted">
                      <span className="font-semibold text-fg">{stats.total}</span> leads
                    </span>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => setHistoryOpen(true)}
              className="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:border-fg/20 hover:text-fg sm:flex"
            >
              <Clock className="h-3.5 w-3.5" />
              History
            </button>
            <Link
              href="/pricing"
              className="hidden items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:flex"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Buy credits
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="overflow-hidden rounded-[1.75rem] border border-line bg-panel">
          {/* Command bar */}
          <div className="border-b border-line px-5 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-display text-lg font-semibold tracking-tight text-fg">
                Find leads
              </h1>
              <button
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-fg sm:hidden"
              >
                <Clock className="h-3.5 w-3.5" />
                History
              </button>
            </div>

            {/* Selected chips + add pickers */}
            <div className="flex flex-wrap items-center gap-2">
              {Array.from(selectedNiches).map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white"
                >
                  {nicheByKey.get(key)?.label || key}
                  <button
                    onClick={() => removeNiche(key)}
                    className="rounded-full p-0.5 opacity-70 transition hover:bg-white/15 hover:opacity-100"
                    aria-label={`Remove ${key}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <div className="relative" ref={nichePickerRef}>
                <button
                  onClick={() => {
                    setNichePickerOpen((o) => !o);
                    setStatePickerOpen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-fg/30 hover:text-fg"
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
                        placeholder="Search niches..."
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
                              onClick={() => addNiche(n.key)}
                              className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-oat"
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

              <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />

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
                      onClick={() => removeState(iso)}
                      className="rounded-full p-0.5 text-muted transition hover:bg-line hover:text-fg"
                      aria-label={`Remove ${iso}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}

              <div className="relative" ref={statePickerRef}>
                <button
                  onClick={() => {
                    setStatePickerOpen((o) => !o);
                    setNichePickerOpen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-fg/30 hover:text-fg"
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
                        placeholder="Search states..."
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
                              onClick={() => addState(s.iso)}
                              className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-oat"
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

            {/* Actions row */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted">
                <span className="whitespace-nowrap">Max</span>
                <input
                  id="limit"
                  type="number"
                  min={1}
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-16 rounded-full border border-line bg-oat px-2.5 py-1.5 text-center text-sm font-semibold text-fg outline-none focus:border-accent"
                />
              </label>
              {quota && (
                <span className="text-xs text-muted">
                  Uses up to <span className="font-semibold text-fg">{effectiveLimit}</span> of{" "}
                  <span className="font-semibold text-fg">{available}</span>
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={stop}
                  disabled={!running}
                  className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-danger disabled:opacity-0"
                >
                  Stop
                </button>
                <button
                  onClick={run}
                  disabled={running || available <= 0}
                  className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
                >
                  {running ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Searching…
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Find leads
                    </>
                  )}
                </button>
              </div>
            </div>

            {quota && available <= 0 && (
              <div className="mt-3 rounded-xl bg-oat px-4 py-3 text-sm">
                <p className="font-medium text-fg">
                  {quota.balance <= 0
                    ? "You've used all your lead credits."
                    : "Daily limit reached — come back tomorrow."}
                </p>
                {quota.balance <= 0 && (
                  <Link
                    href="/pricing"
                    className="mt-2 inline-block text-sm font-semibold text-ink underline underline-offset-2"
                  >
                    Buy a credit pack
                  </Link>
                )}
              </div>
            )}

            {progress && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>
                    Step {progress.step}/{progress.totalSteps}
                  </span>
                  <span>{progress.total} leads</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  {error}
                  {quotaBlocked && (
                    <Link href="/pricing" className="ml-2 font-semibold underline">
                      Buy credits
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="px-5 py-5 sm:px-6">
            <ResultsCharts leads={leads} />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-base font-semibold tracking-tight text-fg">
                  Results
                </h2>
                {stats.total > 0 && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-fg">{stats.total}</span>
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {stats.withPhone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {stats.withWebsite}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {leads.length > 0 && (
                  <div className="relative">
                    <ListFilter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filter…"
                      className="rounded-full border border-line bg-oat py-1.5 pl-8 pr-3 text-sm outline-none focus:border-accent focus:bg-panel"
                    />
                  </div>
                )}
                <button
                  onClick={copyAll}
                  disabled={leads.length === 0}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-30"
                >
                  {copiedAll ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copiedAll ? "Copied" : "Copy"}
                </button>
                <a
                  href="/api/download?format=csv"
                  className={`flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg ${leads.length === 0 ? "pointer-events-none opacity-30" : ""}`}
                >
                  <FileText className="h-4 w-4" />
                  CSV
                </a>
                <a
                  href="/api/download?format=xlsx"
                  className={`flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg ${leads.length === 0 ? "pointer-events-none opacity-30" : ""}`}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </a>
              </div>
            </div>

            {filteredAndSortedLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-oat/60 px-6 py-20 text-center">
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/40 text-ink">
                  {running ? (
                    <LoaderCircle className="h-6 w-6 animate-spin" />
                  ) : (
                    <Search className="h-6 w-6" />
                  )}
                </span>
                <p className="font-display text-base font-semibold tracking-tight text-fg">
                  {running ? "Searching…" : leads.length > 0 ? "No matches" : "Ready when you are"}
                </p>
                <p className="mt-1.5 max-w-sm text-sm text-muted">{emptyMessage}</p>
              </div>
            ) : (
              <div className="scroll-thin max-h-[65vh] overflow-auto rounded-2xl border border-line">
                <table className="w-full min-w-200 text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-oat">
                    <tr className="text-muted">
                      <th className="w-10 border-b border-line px-3 py-2.5" />
                      {columns.map((c) => (
                        <th
                          key={c.label}
                          className={`whitespace-nowrap border-b border-line px-3 py-2.5 font-semibold ${
                            c.key ? "cursor-pointer select-none hover:text-fg" : ""
                          }`}
                          onClick={c.key ? () => toggleSort(c.key!) : undefined}
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.label}
                            {c.key &&
                              (sortKey === c.key ? (
                                sortDir === "asc" ? (
                                  <ArrowUp className="h-3 w-3 text-accent" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-accent" />
                                )
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-40" />
                              ))}
                          </span>
                        </th>
                      ))}
                      <th className="w-24 border-b border-line px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedLeads.map((l, i) => {
                      const key = leadKey(l);
                      const saved = savedKeys.has(key);
                      return (
                        <tr
                          key={key || i}
                          onClick={() => setSelectedLead(l)}
                          className="cursor-pointer border-t border-line/60 align-top transition-colors hover:bg-oat/50"
                        >
                          <td className="px-3 py-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSave(l);
                              }}
                              className={`grid h-6 w-6 place-items-center rounded-md transition ${
                                saved ? "text-accent" : "text-muted hover:text-accent"
                              }`}
                              aria-label={saved ? "Unsave lead" : "Save lead"}
                              title={saved ? "Saved" : "Save lead"}
                            >
                              <Star className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
                            </button>
                          </td>
                          <td className="px-3 py-2 font-semibold">{l.name}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-oat px-2 py-0.5 text-[11px] font-medium text-fg">
                              {l.niche}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted">{l.state}</td>
                          <td className="px-3 py-2 text-muted">{l.city}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted">{l.phone || "-"}</td>
                          <td className="max-w-40 truncate px-3 py-2">
                            {l.website ? (
                              <a
                                href={l.website}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-fg underline-offset-2 hover:underline"
                              >
                                {l.website.replace(/^https?:\/\//, "")}
                              </a>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="max-w-60 px-3 py-2 text-muted">{l.painPoint}</td>
                          <td className="max-w-60 px-3 py-2 font-medium text-fg">{l.pitchAngle}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1 whitespace-nowrap text-muted">
                              Details
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {logs.length > 0 && (
              <details className="mt-4">
                <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
                  <Download className="h-3.5 w-3.5" />
                  Activity log
                </summary>
                <pre
                  ref={logRef}
                  className="scroll-thin mt-2 max-h-40 overflow-auto rounded-xl bg-ink p-3 text-xs text-panel-2"
                >
                  {logs.join("\n")}
                </pre>
              </details>
            )}
          </div>
        </div>
      </main>

      {historyOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-[1px]"
            onClick={() => setHistoryOpen(false)}
            aria-hidden
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-oat px-5 py-4">
              <div>
                <p className="font-display text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                  History
                </p>
                <h2 className="font-display text-lg font-semibold tracking-tight">Recent searches</h2>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-fg"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
              <RecentSearches
                refreshKey={historyRefreshKey}
                activeId={activeSearchId}
                onLoadSearch={loadSearch}
                hideTitle
              />
            </div>
          </aside>
        </div>
      )}

      <LeadDrawer
        lead={selectedLead}
        isSaved={selectedLead ? savedKeys.has(leadKey(selectedLead)) : false}
        onToggleSave={toggleSave}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
