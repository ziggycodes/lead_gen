"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, LoaderCircle, RefreshCw } from "lucide-react";
import type { SearchHistoryItem } from "./types";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-mint/10 text-mint",
  running: "bg-accent/10 text-accent",
  failed: "bg-danger/10 text-danger",
  cancelled: "bg-ink/5 text-muted",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function niceParams(item: SearchHistoryItem): string {
  const niches = (item.params?.niches || "").split(",").filter(Boolean);
  const states = item.params?.states || "US";
  const nichePart =
    niches.length === 0
      ? "Search"
      : niches.length <= 2
        ? niches.join(", ")
        : `${niches.slice(0, 2).join(", ")} +${niches.length - 2}`;
  return `${nichePart} in ${states}`;
}

export function RecentSearches({
  refreshKey,
  activeId,
  onLoadSearch,
  hideTitle = false,
}: {
  refreshKey: number;
  activeId: number | null;
  onLoadSearch: (id: number) => void;
  hideTitle?: boolean;
}) {
  const [items, setItems] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/searches");
      if (res.ok) {
        const json = await res.json();
        setItems(json.searches || []);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div>
      <div className={`mb-3 flex items-center ${hideTitle ? "justify-end" : "justify-between"}`}>
        {!hideTitle && <p className="text-sm font-semibold">Recent searches</p>}
        <button
          onClick={load}
          className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-oat/50 py-10 text-center">
          {loading ? (
            <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
          ) : (
            <Clock className="h-5 w-5 text-muted" />
          )}
          <p className="max-w-[14rem] text-xs text-muted">
            {loading ? "Loading history..." : "Your past searches will appear here."}
          </p>
        </div>
      ) : (
        <ul className="scroll-thin max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const loadable = item.status === "completed" && item.leadCount > 0;
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  disabled={!loadable}
                  onClick={() => loadable && onLoadSearch(item.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-accent bg-accent/15"
                      : "border-line bg-oat hover:border-accent/50"
                  } ${loadable ? "" : "cursor-default opacity-70"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-fg">
                      {niceParams(item)}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        STATUS_STYLES[item.status] || "bg-ink/5 text-muted"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>{formatWhen(item.createdAt)}</span>
                    <span className="font-medium text-fg">{item.leadCount} leads</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
