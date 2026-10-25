"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClass, type AdminActionEntry } from "./types";
import { formatDateTime } from "./format";

function describe(entry: AdminActionEntry): string {
  const d = entry.detail ?? {};
  switch (entry.action) {
    case "set_limit":
      return `Changed the daily email cap from ${d.from ?? "unlimited"} to ${d.to ?? "unlimited"}`;
    case "grant_premium":
      return "Made premium";
    case "revoke_premium":
      return "Removed premium";
    case "flag":
      return d.from === "flagged" ? "Updated the flag" : "Flagged the account";
    case "unflag":
      return "Cleared the flag";
    case "restrict":
      return "Restricted the account";
    case "unrestrict":
      return "Lifted the restriction";
    case "allowlist_add":
      return "Added to the allowlist";
    case "allowlist_remove":
      return "Removed from the allowlist";
    case "cancel_search":
      return `Cancelled search #${d.searchId}`;
    case "fail_stuck_search":
      return `Marked stuck search #${d.searchId} as failed`;
    default:
      return entry.action;
  }
}

export function ActionLine({
  entry,
  showTarget = true,
  onOpenUser,
}: {
  entry: AdminActionEntry;
  showTarget?: boolean;
  onOpenUser?: (userId: number) => void;
}) {
  const note = typeof entry.detail?.note === "string" ? entry.detail.note : null;
  const target = entry.targetLabel || "a deleted account";
  return (
    <div className="text-sm">
      <p>
        {describe(entry)}
        {showTarget ? (
          <>
            {" for "}
            {entry.targetUserId && onOpenUser ? (
              <button type="button" onClick={() => onOpenUser(entry.targetUserId!)} className="font-medium hover:underline">
                {target}
              </button>
            ) : (
              <span className="font-medium">{target}</span>
            )}
          </>
        ) : null}
      </p>
      {note ? <p className="mt-0.5 text-muted">“{note}”</p> : null}
      <p className="mt-0.5 text-xs text-muted">
        {entry.adminEmail} · {formatDateTime(entry.createdAt)}
      </p>
    </div>
  );
}

export function ActivityView({ onOpenUser }: { onOpenUser: (userId: number) => void }) {
  const [entries, setEntries] = useState<AdminActionEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/activity${before ? `?before=${before}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not load activity.");
        return;
      }
      const next = data.actions as AdminActionEntry[];
      setEntries((current) => (before ? [...current, ...next] : next));
      setCursor(data.nextCursor ?? null);
    } catch {
      setError("Could not load activity. Check your connection and try again.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Activity</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">Every change an admin has made, newest first.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {loaded && entries.length === 0 && !error ? (
        <p className="mt-8 text-sm text-muted">No admin changes yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {entries.map((entry) => (
            <li key={entry.id} className="py-3">
              <ActionLine entry={entry} onOpenUser={onOpenUser} />
            </li>
          ))}
        </ul>
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
