"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock, Columns3, Inbox, Mail, Search, Star, Users } from "lucide-react";
import type { SearchHistoryItem } from "./types";
import type { LeadFilters } from "./leadFilters";
import { EMPTY_FILTERS } from "./leadFilters";
import { formatDate } from "./format";

function searchLabel(s: SearchHistoryItem): string {
  const niches = (s.params?.niches || "").split(",").filter(Boolean);
  const nichePart =
    niches.length <= 2 ? niches.join(", ") : `${niches.slice(0, 2).join(", ")} +${niches.length - 2}`;
  return `${nichePart || "Search"} · ${s.params?.states || "US"}`;
}

export type WorkbenchView = "table" | "pipeline" | "mailboxes" | "conversations";

export function Sidebar({
  filters,
  counts,
  historyKey,
  onFilters,
  onFind,
  onRerun,
  onNavigate,
  view,
  onView,
  className = "",
}: {
  filters: LeadFilters;
  counts: { total: number; byStatus: Map<string, number>; saved: number; due: number };
  historyKey: number;
  onFilters: (next: LeadFilters) => void;
  onFind: () => void;
  onRerun: (search: SearchHistoryItem) => void;
  onNavigate?: () => void;
  view: WorkbenchView;
  onView: (view: WorkbenchView) => void;
  className?: string;
}) {
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    fetch("/api/searches")
      .then((r) => (r.ok ? r.json() : { searches: [] }))
      .then((json) => setSearches(json.searches || []))
      .catch(() => {});
  }, [historyKey]);

  const go = (next: LeadFilters) => {
    if (view === "mailboxes" || view === "conversations") onView("table");
    onFilters(next);
    onNavigate?.();
  };

  const allActive =
    filters.status === "all" &&
    !filters.savedOnly &&
    !filters.followUpDue &&
    filters.source === null;

  return (
    <aside className={`flex h-full w-full shrink-0 flex-col border-r border-line bg-oat ${className}`}>
      <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-xs font-medium text-muted">Today</p>
          <RailButton
            active={allActive && view === "table"}
            onClick={() => {
              onView("table");
              go(EMPTY_FILTERS);
            }}
            icon={<Users className="h-3.5 w-3.5" />}
            label="All leads"
            count={counts.total}
          />
          <RailButton
            active={filters.followUpDue}
            onClick={() =>
              go({
                ...EMPTY_FILTERS,
                followUpDue: !filters.followUpDue,
              })
            }
            icon={<CalendarClock className={`h-3.5 w-3.5 ${counts.due ? "text-accent" : ""}`} />}
            label="Due today"
            count={counts.due}
            hot={counts.due > 0}
          />
          <RailButton
            active={filters.status === "new" && !filters.savedOnly && !filters.followUpDue}
            onClick={() =>
              go({
                ...EMPTY_FILTERS,
                status: filters.status === "new" ? "all" : "new",
              })
            }
            label="New"
            count={counts.byStatus.get("new") || 0}
          />
          <RailButton
            active={filters.savedOnly}
            onClick={() =>
              go({
                ...EMPTY_FILTERS,
                savedOnly: !filters.savedOnly,
              })
            }
            icon={<Star className="h-3.5 w-3.5" />}
            label="Saved"
            count={counts.saved}
          />
        </div>

        <div className="space-y-0.5">
          <RailButton
            active={view === "pipeline"}
            onClick={() => {
              onView(view === "pipeline" ? "table" : "pipeline");
              onNavigate?.();
            }}
            icon={<Columns3 className="h-3.5 w-3.5" />}
            label="Pipeline"
            count={counts.total}
          />
        </div>

        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-xs font-medium text-muted">Mail</p>
          <RailButton
            active={view === "mailboxes"}
            onClick={() => {
              onView("mailboxes");
              onNavigate?.();
            }}
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Mailboxes"
          />
          <RailButton
            active={view === "conversations"}
            onClick={() => {
              onView("conversations");
              onNavigate?.();
            }}
            icon={<Inbox className="h-3.5 w-3.5" />}
            label="Conversations"
          />
        </div>

        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-xs font-medium text-muted">Searches</p>
          {searches.length === 0 ? (
            <p className="px-2 text-xs text-muted">Past searches show up here.</p>
          ) : (
            searches.slice(0, 8).map((s) => (
              <div key={s.id} className="group flex items-center gap-1">
                <button
                  onClick={() => go({ ...EMPTY_FILTERS, source: filters.source === s.id ? null : s.id })}
                  className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm ${
                    filters.source === s.id ? "bg-ink text-white" : "text-fg hover:bg-panel"
                  }`}
                  title={`${searchLabel(s)} · ${formatDate(s.createdAt)}`}
                >
                  {searchLabel(s)}
                </button>
                <button
                  onClick={() => {
                    onRerun(s);
                    onNavigate?.();
                  }}
                  className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted opacity-0 transition hover:text-fg group-hover:opacity-100"
                  title="Run this search again"
                >
                  Run
                </button>
              </div>
            ))
          )}
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <button
          onClick={() => {
            onFind();
            onNavigate?.();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-ink"
        >
          <Search className="h-4 w-4" />
          Find leads
        </button>
      </div>
    </aside>
  );
}

function RailButton({
  active,
  onClick,
  icon,
  label,
  count,
  hot,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  count?: number;
  hot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
        active ? "bg-ink font-medium text-white" : "text-fg hover:bg-panel"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && (
        <span className={`text-xs tabular-nums ${active ? "text-white/70" : hot ? "font-semibold text-accent" : "text-muted"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
