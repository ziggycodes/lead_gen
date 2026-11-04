"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleAlert,
  Columns3,
  Copy,
  Check,
  LayoutList,
  ListFilter,
  LoaderCircle,
  Mail,
  Phone,
  Search,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { LEAD_STATUSES, STATUS_LABELS, STATUS_STYLES, isLeadStatus } from "@/lib/crm";
import type { BulkSend, CrmLead, SearchHistoryItem } from "./types";
import { BulkSendProgress, BulkSendSheet } from "./BulkSendSheet";
import { bulkDeleteLeads, bulkUpdateLeads, fetchLeads, fetchOfferProfile, researchLeads } from "./crmApi";
import { formatDate, isFollowUpDue, location, timeAgo } from "./format";
import { EMPTY_FILTERS, filterLeads, filtersActive, type LeadFilters } from "./leadFilters";
import { leadToText } from "./LeadDrawer";
import { BoardView } from "./BoardView";

type SortKey = "name" | "status" | "niche" | "location" | "followUp" | "lastActivity" | "createdAt";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "pipeline";

const PAGE_SIZE = 100;
const STATUS_ORDER = new Map<string, number>(LEAD_STATUSES.map((s, i) => [s, i]));

function searchLabel(s: SearchHistoryItem): string {
  const niches = (s.params?.niches || "").split(",").filter(Boolean);
  const nichePart =
    niches.length <= 2 ? niches.join(", ") : `${niches.slice(0, 2).join(", ")} +${niches.length - 2}`;
  return `${nichePart || "Search"} in ${s.params?.states || "US"} · ${formatDate(s.createdAt)}`;
}

function compareLeads(a: CrmLead, b: CrmLead, key: SortKey): number {
  switch (key) {
    case "status":
      return (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99);
    case "followUp": {
      const av = a.followUpAt ? Date.parse(a.followUpAt) : Infinity;
      const bv = b.followUpAt ? Date.parse(b.followUpAt) : Infinity;
      return av === bv ? 0 : av < bv ? -1 : 1;
    }
    case "lastActivity":
      return Date.parse(a.lastActivityAt) - Date.parse(b.lastActivityAt);
    case "createdAt":
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case "location":
      return location(a.city, a.state).localeCompare(location(b.city, b.state));
    default:
      return (a[key] || "").localeCompare(b[key] || "", undefined, { sensitivity: "base" });
  }
}

export function CrmView({
  leads,
  loading,
  loadError,
  truncated,
  filters,
  onFiltersChange,
  onOpenLead,
  onLeadsUpdated,
  onLeadsDeleted,
  onFindLeads,
  view,
  onViewChange,
  onOpenMailboxes,
}: {
  leads: CrmLead[];
  loading: boolean;
  loadError: string | null;
  truncated: boolean;
  filters: LeadFilters;
  onFiltersChange: (next: LeadFilters) => void;
  onOpenLead: (id: number) => void;
  onLeadsUpdated: (leads: CrmLead[]) => void;
  onLeadsDeleted: (ids: number[]) => void;
  onFindLeads: () => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onOpenMailboxes?: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkStarted, setBulkStarted] = useState<BulkSend | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    fetchOfferProfile()
      .then((json) => setAiEnabled(json.ai === "available"))
      .catch(() => {});
  }, []);

  // While AI research runs in the background, refresh leads until none are pending.
  const researching = leads.some((l) => l.insightStatus === "pending");
  useEffect(() => {
    if (!researching) return;
    const timer = window.setInterval(() => {
      fetchLeads()
        .then(({ leads: fresh }) => onLeadsUpdated(fresh))
        .catch(() => {});
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [researching, onLeadsUpdated]);

  const setFilters = (patch: Partial<LeadFilters>) => {
    onFiltersChange({ ...filters, ...patch });
    setVisible(PAGE_SIZE);
  };

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filters.status, filters.source, filters.savedOnly, filters.followUpDue, filters.niche, filters.state]);

  useEffect(() => {
    fetch("/api/searches")
      .then((r) => (r.ok ? r.json() : { searches: [] }))
      .then((json) => setSearches(json.searches || []))
      .catch(() => {});
  }, [leads.length]);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(leads.map((l) => l.id));
      const next = new Set(Array.from(prev).filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [leads]);

  const nicheOptions = useMemo(
    () => Array.from(new Set(leads.map((l) => l.niche).filter(Boolean))).sort(),
    [leads]
  );
  const stateOptions = useMemo(
    () => Array.from(new Set(leads.map((l) => l.state).filter(Boolean))).sort(),
    [leads]
  );
  const sourceOptions = useMemo(() => {
    const byId = new Map(searches.map((s) => [s.id, s]));
    const ids = Array.from(new Set(leads.map((l) => l.sourceSearchId).filter((v): v is number => v !== null)));
    return ids
      .sort((a, b) => b - a)
      .map((id) => ({ id, label: byId.has(id) ? searchLabel(byId.get(id)!) : `Search #${id}` }));
  }, [leads, searches]);

  const filtered = useMemo(() => {
    const rows = filterLeads(leads, filters);
    rows.sort((a, b) => {
      const c = compareLeads(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return rows;
  }, [leads, filters, sortKey, sortDir]);

  const active = filtersActive(filters);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "lastActivity" || key === "createdAt" ? "desc" : "asc");
    }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleSelectAll = () =>
    setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((l) => l.id)));
  const toggleRow = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateMany = (ids: number[], body: { status?: string; saved?: boolean }) =>
    act(async () => {
      const { leads: updated } = await bulkUpdateLeads(ids, body);
      onLeadsUpdated(updated);
    });

  const deleteSelected = () =>
    act(async () => {
      const { deleted } = await bulkDeleteLeads(Array.from(selected));
      onLeadsDeleted(deleted);
      setSelected(new Set());
      setConfirmDelete(false);
    });

  const researchSelected = () =>
    act(async () => {
      const { queued } = await researchLeads(selectedIds);
      const ids = new Set(queued);
      onLeadsUpdated(
        leads.filter((l) => ids.has(l.id)).map((l) => ({ ...l, insightStatus: "pending" as const }))
      );
      setSelected(new Set());
    });

  const copyLead = async (lead: CrmLead) => {
    try {
      await navigator.clipboard.writeText(leadToText(lead));
      setCopiedId(lead.id);
      window.setTimeout(() => setCopiedId((id) => (id === lead.id ? null : id)), 1500);
    } catch {
      setActionError("Could not copy that lead.");
    }
  };

  const selectedIds = Array.from(selected);
  const shown = filtered.slice(0, visible);

  const columns: { label: string; key?: SortKey }[] = [
    { label: "Business", key: "name" },
    { label: "Status", key: "status" },
    { label: "Niche", key: "niche" },
    { label: "Location", key: "location" },
    { label: "Follow-up", key: "followUp" },
    { label: "Last activity", key: "lastActivity" },
    { label: "Added", key: "createdAt" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="space-y-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-lg font-semibold tracking-tight text-fg">
              {view === "pipeline" ? "Pipeline" : "Leads"}
            </h1>
            <span className="text-xs text-muted">
              {active ? `${filtered.length} of ${leads.length}` : `${leads.length} total`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-line p-0.5">
              <button
                onClick={() => onViewChange("table")}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  view === "table" ? "bg-ink text-white" : "text-muted"
                }`}
                aria-pressed={view === "table"}
              >
                <LayoutList className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                onClick={() => onViewChange("pipeline")}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  view === "pipeline" ? "bg-ink text-white" : "text-muted"
                }`}
                aria-pressed={view === "pipeline"}
              >
                <Columns3 className="h-3.5 w-3.5" />
                Pipeline
              </button>
            </div>
            <button
              onClick={onFindLeads}
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink"
            >
              <Search className="h-4 w-4" />
              Find leads
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <ListFilter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={filters.query}
              onChange={(e) => setFilters({ query: e.target.value })}
              placeholder="Search name, contact, email, city"
              className="w-full rounded-full border border-line bg-oat py-1.5 pl-8 pr-3 text-sm outline-none focus:border-accent focus:bg-panel"
            />
          </div>
          {view === "table" && (
            <FilterSelect
              value={filters.status}
              onChange={(v) => {
                if (v === "all" || isLeadStatus(v)) setFilters({ status: v });
              }}
              options={[
                { value: "all", label: "All statuses" },
                ...LEAD_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
              ]}
            />
          )}
          <FilterSelect
            value={filters.niche}
            onChange={(v) => setFilters({ niche: v })}
            options={[{ value: "", label: "All niches" }, ...nicheOptions.map((n) => ({ value: n, label: n }))]}
          />
          <FilterSelect
            value={filters.state}
            onChange={(v) => setFilters({ state: v })}
            options={[{ value: "", label: "All states" }, ...stateOptions.map((s) => ({ value: s, label: s }))]}
          />
          {sourceOptions.length > 0 && (
            <FilterSelect
              value={filters.source === null ? "" : String(filters.source)}
              onChange={(v) => setFilters({ source: v ? Number(v) : null })}
              options={[
                { value: "", label: "Any source" },
                ...sourceOptions.map((s) => ({ value: String(s.id), label: s.label })),
              ]}
            />
          )}
          <Toggle
            active={filters.hasEmail}
            onClick={() => setFilters({ hasEmail: !filters.hasEmail })}
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Has email"
          />
          <Toggle
            active={filters.hasPhone}
            onClick={() => setFilters({ hasPhone: !filters.hasPhone })}
            icon={<Phone className="h-3.5 w-3.5" />}
            label="Has phone"
          />
          {aiEnabled && (
            <Toggle
              active={filters.aiReady}
              onClick={() => setFilters({ aiReady: !filters.aiReady })}
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="AI ready"
            />
          )}
          {active && (
            <button
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>

        <BulkSendProgress started={bulkStarted} onLeadsRefreshed={onLeadsUpdated} />

        {bulkEmailOpen && (
          <BulkSendSheet
            leads={leads.filter((l) => selected.has(l.id))}
            onClose={() => setBulkEmailOpen(false)}
            onStarted={(send) => {
              setBulkStarted(send);
              setBulkEmailOpen(false);
              setSelected(new Set());
            }}
            onOpenMailboxes={onOpenMailboxes}
          />
        )}

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-sm text-white">
            <span className="font-semibold">{selected.size} selected</span>
            <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />
            <select
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && updateMany(selectedIds, { status: e.target.value })}
              className="rounded-full bg-white/10 px-3 py-1 text-sm text-white outline-none"
            >
              <option value="" className="text-ink">
                Move to…
              </option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s} className="text-ink">
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <BulkButton disabled={busy} onClick={() => updateMany(selectedIds, { saved: true })}>
              <Star className="h-3.5 w-3.5" />
              Save
            </BulkButton>
            <BulkButton disabled={busy} onClick={() => updateMany(selectedIds, { saved: false })}>
              Unsave
            </BulkButton>
            <BulkButton disabled={busy} onClick={() => setBulkEmailOpen(true)}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </BulkButton>
            {aiEnabled && (
              <BulkButton disabled={busy} onClick={researchSelected}>
                <Sparkles className="h-3.5 w-3.5" />
                Research with AI
              </BulkButton>
            )}
            <div className="ml-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-white/70">Delete {selected.size}?</span>
                  <BulkButton disabled={busy} onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </BulkButton>
                  <button
                    onClick={deleteSelected}
                    disabled={busy}
                    className="rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <BulkButton disabled={busy} onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </BulkButton>
              )}
              <button
                onClick={() => {
                  setSelected(new Set());
                  setConfirmDelete(false);
                }}
                className="grid h-6 w-6 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {(actionError || loadError) && (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{actionError || loadError}</div>
          </div>
        )}
        {truncated && <p className="text-xs text-muted">Showing your 5,000 most recently active leads.</p>}
      </div>

      {loading && leads.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <LoaderCircle className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/30 text-ink">
            <Users className="h-6 w-6" />
          </span>
          <p className="font-display text-base font-semibold tracking-tight text-fg">Your CRM is empty</p>
          <p className="mt-1.5 max-w-sm text-sm text-muted">
            Run a search and every business you find lands here, ready to track from New to Won.
          </p>
          <button
            onClick={onFindLeads}
            className="mt-5 flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink"
          >
            <Search className="h-4 w-4" />
            Find your first leads
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="font-display text-base font-semibold tracking-tight text-fg">No leads match these filters</p>
          <button
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            className="mt-3 rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-medium text-fg hover:border-fg/30"
          >
            Clear filters
          </button>
        </div>
      ) : view === "pipeline" ? (
        <BoardView leads={filtered} onOpenLead={onOpenLead} onLeadsUpdated={onLeadsUpdated} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scroll-thin min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-oat">
                <tr className="text-muted">
                  <th className="w-9 border-b border-line px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      aria-label={`Select all ${filtered.length} leads`}
                      className="h-3.5 w-3.5 cursor-pointer accent-accent"
                    />
                  </th>
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
                  <th className="border-b border-line px-3 py-2.5 font-semibold">Reach</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const due = isFollowUpDue(l.followUpAt);
                  return (
                    <tr
                      key={l.id}
                      onClick={() => onOpenLead(l.id)}
                      className={`cursor-pointer border-t border-line/70 align-middle hover:bg-oat/60 ${
                        selected.has(l.id) ? "bg-accent/15" : due ? "bg-accent/10" : ""
                      }`}
                    >
                      <td className={`px-3 py-2 ${due ? "border-l-2 border-l-accent" : "border-l-2 border-l-transparent"}`}>
                        <input
                          type="checkbox"
                          checked={selected.has(l.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleRow(l.id)}
                          aria-label={`Select ${l.name}`}
                          className="h-3.5 w-3.5 cursor-pointer accent-accent"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMany([l.id], { saved: !l.saved });
                          }}
                          disabled={busy}
                          className={`grid h-6 w-6 place-items-center rounded-md ${
                            l.saved ? "text-accent" : "text-muted hover:text-ink"
                          }`}
                          aria-label={l.saved ? "Unsave lead" : "Save lead"}
                        >
                          <Star className={`h-4 w-4 ${l.saved ? "fill-accent" : ""}`} />
                        </button>
                      </td>
                      <td className="max-w-56 px-3 py-2">
                        <span className="block truncate font-semibold text-fg">{l.name}</span>
                        {l.contactName && (
                          <span className="block truncate text-[11px] text-muted">{l.contactName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={l.status}
                          disabled={busy}
                          onChange={(e) => updateMany([l.id], { status: e.target.value })}
                          aria-label={`Status for ${l.name}`}
                          className={`cursor-pointer appearance-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold outline-none ${
                            isLeadStatus(l.status) ? STATUS_STYLES[l.status] : "bg-oat text-muted"
                          }`}
                        >
                          {LEAD_STATUSES.map((s) => (
                            <option key={s} value={s} className="bg-panel text-fg">
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {l.niche && (
                          <span className="whitespace-nowrap rounded-full bg-oat px-2 py-0.5 text-[11px] font-medium text-fg">
                            {l.niche}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">{location(l.city, l.state) || "—"}</td>
                      <td className={`whitespace-nowrap px-3 py-2 ${due ? "font-semibold text-accent" : "text-muted"}`}>
                        {l.followUpAt ? formatDate(l.followUpAt) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">{timeAgo(l.lastActivityAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(l.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-1">
                          {l.phone ? (
                            <a
                              href={`tel:${l.phone}`}
                              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-oat hover:text-fg"
                              aria-label={`Call ${l.name}`}
                              title={l.phone}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {l.email ? (
                            <a
                              href={`mailto:${l.email}`}
                              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-oat hover:text-fg"
                              aria-label={`Email ${l.name}`}
                              title={l.email}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          <button
                            onClick={() => copyLead(l)}
                            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-oat hover:text-fg"
                            aria-label={`Copy ${l.name}`}
                            title="Copy contact card"
                          >
                            {copiedId === l.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > shown.length && (
            <div className="flex items-center justify-center gap-3 border-t border-line py-2 text-xs text-muted">
              <span>
                Showing {shown.length} of {filtered.length}
              </span>
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE * 2)}
                className="rounded-full border border-line px-3 py-1.5 font-medium text-fg hover:border-fg/30"
              >
                Show more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`max-w-56 rounded-full border px-3 py-1.5 text-sm outline-none focus:border-accent ${
        value && value !== "all" ? "border-ink bg-panel font-medium text-fg" : "border-line bg-oat text-muted"
      }`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-ink bg-ink font-medium text-white" : "border-line bg-oat text-muted hover:text-fg"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function BulkButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
