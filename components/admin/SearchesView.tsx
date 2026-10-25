"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { buttonClass, chipClass, type AdminSearchRow, type AdminSearchStatus } from "./types";
import { formatAgo, formatCount, formatDateTime, formatDuration } from "./format";

const FILTERS: { key: AdminSearchStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "queued", label: "Queued" },
  { key: "stuck", label: "Stuck" },
  { key: "failed", label: "Failed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL: Record<AdminSearchStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  stuck: "Stuck",
};

export function SearchStatusBadge({ status }: { status: AdminSearchStatus }) {
  const styles =
    status === "failed" || status === "stuck"
      ? "border-danger text-danger"
      : status === "running" || status === "queued"
        ? "border-accent text-fg"
        : "border-line text-muted";
  return (
    <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function nicheSummary(niches: string | null): string {
  if (!niches) return "";
  const list = niches.split(",").filter(Boolean);
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

export function SearchesView({
  initialStatus,
  onOpenUser,
}: {
  initialStatus: AdminSearchStatus | "all";
  onOpenUser: (userId: number) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [rows, setRows] = useState<AdminSearchRow[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  useEffect(() => setStatus(initialStatus), [initialStatus]);

  const load = useCallback(
    async (before: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (status !== "all") params.set("status", status);
        if (before) params.set("before", String(before));
        const res = await fetch(`/api/admin/searches?${params}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Could not load searches.");
          return;
        }
        const next = data.searches as AdminSearchRow[];
        setRows((current) => (before ? [...current, ...next] : next));
        setCursor(data.nextCursor ?? null);
      } catch {
        setError("Could not load searches. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  async function cancel(search: AdminSearchRow) {
    const verb = search.status === "stuck" ? "Mark this stuck search as failed?" : "Cancel this search?";
    if (cancelling || !window.confirm(verb)) return;
    setCancelling(search.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/searches/${search.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not cancel that search.");
        return;
      }
      const updated = data.search as AdminSearchRow | null;
      if (updated) setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch {
      setError("Could not cancel that search. Check your connection and try again.");
    } finally {
      setCancelling(null);
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Searches</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Every search across all accounts, newest first. A search is stuck when its worker has stopped checking in.
          </p>
        </div>
        <button type="button" onClick={() => load(null)} disabled={loading} className={`${buttonClass} inline-flex items-center gap-1.5`}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={status === filter.key}
            onClick={() => setStatus(filter.key)}
            className={chipClass(status === filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {rows.length === 0 && !loading ? (
        <p className="mt-8 text-sm text-muted">No searches match.</p>
      ) : (
        <div className="relative mt-6 overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="px-3 py-2 font-medium">Search</th>
                <th scope="col" className="px-3 py-2 font-medium">User</th>
                <th scope="col" className="px-3 py-2 font-medium">Where / what</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Leads</th>
                <th scope="col" className="px-3 py-2 font-medium">Duration</th>
                <th scope="col" className="px-3 py-2 font-medium">Started</th>
                <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((search) => {
                const active = search.status === "queued" || search.status === "running" || search.status === "stuck";
                return (
                  <Fragment key={search.id}>
                    <tr
                      className={search.error ? "cursor-pointer hover:bg-oat/60" : ""}
                      onClick={() => search.error && setExpanded(expanded === search.id ? null : search.id)}
                    >
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <SearchStatusBadge status={search.status} />
                          <span className="text-xs text-muted tabular-nums">#{search.id}</span>
                        </span>
                      </td>
                      <td className="max-w-48 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenUser(search.userId);
                          }}
                          className="block max-w-full truncate text-left hover:underline"
                        >
                          {search.userLabel}
                        </button>
                      </td>
                      <td className="max-w-64 px-3 py-2.5">
                        <span className="block truncate">{search.states || "US"}</span>
                        <span className="block truncate text-xs text-muted">
                          {search.mode === "premium" ? "Premium" : "Regular"}
                          {search.niches ? ` · ${nicheSummary(search.niches)}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatCount(search.leadCount)}
                        {search.limit ? <span className="text-xs text-muted"> / {formatCount(search.limit)}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDuration(search.durationSeconds)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted" title={formatDateTime(search.createdAt)}>
                        {formatAgo(search.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {active ? (
                          <button
                            type="button"
                            disabled={cancelling === search.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void cancel(search);
                            }}
                            className="text-xs font-medium text-danger hover:underline disabled:opacity-40"
                          >
                            {search.status === "stuck" ? "Mark failed" : "Cancel"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === search.id && search.error ? (
                      <tr className="bg-oat/40">
                        <td colSpan={7} className="px-3 py-2 text-sm text-danger">
                          {search.error}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cursor ? (
        <div className="mt-4">
          <button type="button" disabled={loading} onClick={() => load(cursor)} className={buttonClass}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
