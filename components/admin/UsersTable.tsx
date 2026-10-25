"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { chipClass, type AdminAccount, type UserFocus } from "./types";
import { formatAgo, formatCount, formatDate } from "./format";

const PAGE = 50;

type SortKey = "user" | "plan" | "status" | "leads" | "emails" | "balance" | "lastSearchAt" | "createdAt";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "user", label: "User" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Status" },
  { key: "leads", label: "Leads", numeric: true },
  { key: "emails", label: "Emails today", numeric: true },
  { key: "balance", label: "Balance", numeric: true },
  { key: "lastSearchAt", label: "Last active" },
  { key: "createdAt", label: "Joined" },
];

const FOCUS_LABELS: { key: UserFocus; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "premium", label: "Premium" },
  { key: "flagged", label: "Flagged" },
  { key: "restricted", label: "Restricted" },
  { key: "at_cap", label: "At email cap" },
];

export function atEmailCap(account: AdminAccount): boolean {
  return account.emailDailyLimit != null && account.emailsFoundToday >= account.emailDailyLimit;
}

function sortValue(account: AdminAccount, key: SortKey): string | number {
  switch (key) {
    case "user":
      return (account.name || account.email || "").toLowerCase();
    case "plan":
      return account.plan;
    case "status":
      return account.accountStatus;
    case "leads":
      return account.leadCount;
    case "emails":
      return account.emailsFoundToday;
    case "balance":
      return account.balance;
    case "lastSearchAt":
      return account.lastSearchAt ? Date.parse(account.lastSearchAt) : 0;
    case "createdAt":
      return Date.parse(account.createdAt) || 0;
  }
}

export function StatusBadge({ status }: { status: AdminAccount["accountStatus"] }) {
  const styles = {
    active: "border-line text-muted",
    flagged: "border-accent text-fg",
    restricted: "border-danger text-danger",
  }[status];
  const label = { active: "Active", flagged: "Flagged", restricted: "Restricted" }[status];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{label}</span>;
}

function emailsCell(account: AdminAccount): string {
  return account.emailDailyLimit == null
    ? `${account.emailsFoundToday}`
    : `${account.emailsFoundToday} / ${account.emailDailyLimit}`;
}

export function UsersTable({
  accounts,
  focus,
  onFocus,
  onOpen,
}: {
  accounts: AdminAccount[];
  focus: UserFocus;
  onFocus: (focus: UserFocus) => void;
  onOpen: (userId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(0);

  const counts = useMemo(
    () => ({
      all: accounts.length,
      premium: accounts.filter((a) => a.plan === "premium").length,
      flagged: accounts.filter((a) => a.accountStatus === "flagged").length,
      restricted: accounts.filter((a) => a.accountStatus === "restricted").length,
      at_cap: accounts.filter(atEmailCap).length,
    }),
    [accounts]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = accounts.filter((account) => {
      if (focus === "premium" && account.plan !== "premium") return false;
      if (focus === "flagged" && account.accountStatus !== "flagged") return false;
      if (focus === "restricted" && account.accountStatus !== "restricted") return false;
      if (focus === "at_cap" && !atEmailCap(account)) return false;
      if (!needle) return true;
      return (
        (account.name || "").toLowerCase().includes(needle) || (account.email || "").toLowerCase().includes(needle)
      );
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [accounts, focus, query, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * PAGE, current * PAGE + PAGE);

  function toggleSort(key: SortKey) {
    setPage(0);
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "user" ? "asc" : "desc" }
    );
  }

  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Users</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Open a user to set their email cap, change their plan, or flag and restrict them. They see a notice for each
        change.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="account-filter">
          Find a user
        </label>
        <input
          id="account-filter"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Name or email"
          className="w-full max-w-xs rounded-full border border-line bg-panel px-4 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          {FOCUS_LABELS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={focus === item.key}
              onClick={() => {
                onFocus(item.key);
                setPage(0);
              }}
              className={chipClass(focus === item.key)}
            >
              {item.label} <span className="tabular-nums opacity-70">{counts[item.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No accounts match.</p>
      ) : (
        <>
          <div className="relative mt-6 hidden overflow-x-auto rounded-2xl border border-line bg-panel md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={`px-3 py-2 font-medium ${col.numeric ? "text-right" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-fg"
                      >
                        {col.label}
                        {sort.key === col.key ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          )
                        ) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageRows.map((account) => (
                  <tr
                    key={account.id}
                    onClick={() => onOpen(account.id)}
                    className="cursor-pointer hover:bg-oat/60"
                  >
                    <td className="max-w-64 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(account.id);
                        }}
                        className="block max-w-full truncate text-left font-medium hover:underline"
                      >
                        {account.name || account.email || "No email"}
                      </button>
                      {account.name && account.email ? (
                        <span className="block truncate text-xs text-muted">{account.email}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {account.plan === "premium" ? "Premium" : "Regular"}
                      {account.isAdmin ? <span className="ml-1 text-xs text-muted">· Admin</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={account.accountStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCount(account.leadCount)}
                      <span className="block text-xs text-muted">{formatCount(account.leadsWithEmail)} with email</span>
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${atEmailCap(account) ? "text-danger" : ""}`}>
                      {emailsCell(account)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(account.balance)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatAgo(account.lastSearchAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDate(account.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-6 divide-y divide-line border-y border-line md:hidden">
            {pageRows.map((account) => (
              <li key={account.id}>
                <button type="button" onClick={() => onOpen(account.id)} className="w-full py-3 text-left">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{account.name || account.email || "No email"}</span>
                    <StatusBadge status={account.accountStatus} />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {account.plan === "premium" ? "Premium" : "Regular"} · {formatCount(account.leadCount)} leads ·{" "}
                    {emailsCell(account)} emails today · Active {formatAgo(account.lastSearchAt).toLowerCase()}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>
                {current * PAGE + 1}–{Math.min(shown.length, (current + 1) * PAGE)} of {shown.length}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                  className="rounded-full border border-line bg-panel px-3 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={current >= pages - 1}
                  onClick={() => setPage(current + 1)}
                  className="rounded-full border border-line bg-panel px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </span>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
