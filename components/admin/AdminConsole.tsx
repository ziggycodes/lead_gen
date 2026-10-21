"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { AllowlistManager } from "@/components/admin/AllowlistManager";
import { Brand } from "@/components/Brand";

export interface AdminAccount {
  id: number;
  email: string | null;
  name: string | null;
  country: string | null;
  plan: "free" | "premium";
  createdAt: string;
  accountStatus: "active" | "flagged" | "restricted";
  accountNote: string | null;
  emailDailyLimit: number | null;
  emailsFoundToday: number;
  leadCount: number;
  leadsWithEmail: number;
  totalConsumed: number;
  hasMailbox: boolean;
  isAdmin: boolean;
}

const inputClass =
  "min-w-0 rounded-full border border-line bg-panel px-4 py-2 text-sm text-fg outline-none focus:border-accent";
const buttonClass =
  "rounded-full border border-line bg-panel px-3 py-2 text-sm font-medium text-fg transition-opacity hover:border-ink disabled:opacity-40";
const inkButtonClass =
  "rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40";

function capPhrase(account: AdminAccount): string {
  if (account.emailDailyLimit == null) {
    const found =
      account.emailsFoundToday === 1
        ? "1 email found today"
        : `${account.emailsFoundToday} emails found today`;
    return `${found}, no daily cap`;
  }
  return `${account.emailsFoundToday} of ${account.emailDailyLimit} emails today`;
}

function formatJoined(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusLine(account: AdminAccount): string {
  const cap = capPhrase(account);
  if (account.accountStatus === "flagged") return `Flagged. New searches are paused. ${cap}.`;
  if (account.accountStatus === "restricted") return `Restricted. Locked out until you lift it. ${cap}.`;
  return `Active. ${cap}.`;
}

function AccountRow({
  account,
  onUpdated,
}: {
  account: AdminAccount;
  onUpdated: (next: AdminAccount) => void;
}) {
  const [limit, setLimit] = useState(account.emailDailyLimit == null ? "" : String(account.emailDailyLimit));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function act(
    action: "set_limit" | "flag" | "unflag" | "restrict" | "unrestrict" | "grant_premium" | "revoke_premium"
  ) {
    if (pending) return;
    if ((action === "flag" || action === "restrict") && !note.trim()) {
      setError("Write a note. They will see it.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: account.id,
          action,
          emailDailyLimit: action === "set_limit" ? limit.trim() : undefined,
          note: note.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not update that account.");
        return;
      }
      const next = data.account as AdminAccount;
      onUpdated(next);
      setLimit(next.emailDailyLimit == null ? "" : String(next.emailDailyLimit));
      if (action === "flag" || action === "restrict") setNote("");
    } catch {
      setError("Could not update that account. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const label = account.name || account.email || "No email on this account";
  const joined = formatJoined(account.createdAt);

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate font-medium">{label}</p>
          {account.name && account.email ? <p className="truncate text-sm text-muted">{account.email}</p> : null}
        </div>
        {account.isAdmin ? <span className="text-sm text-muted">Admin</span> : null}
      </div>
      <p className="mt-1 max-w-xl text-sm text-muted">{statusLine(account)}</p>
      <p className="mt-1 max-w-xl text-sm text-muted">
        {account.plan === "premium" ? "Premium" : "Regular"}
        {joined ? ` · Joined ${joined}` : ""}
        {account.country ? ` · ${account.country}` : ""}
      </p>
      <p className="mt-1 max-w-xl text-sm text-muted">
        {account.leadCount} leads, {account.leadsWithEmail} with an email. {account.totalConsumed} returned by
        searches. {account.hasMailbox ? "Mailbox connected." : "No mailbox."}
      </p>
      {account.accountNote ? (
        <p className="mt-2 max-w-xl text-sm">They see: {account.accountNote}</p>
      ) : null}

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void act("set_limit");
        }}
      >
        <label className="sr-only" htmlFor={`limit-${account.id}`}>
          Daily email limit for {label}
        </label>
        <input
          id={`limit-${account.id}`}
          inputMode="numeric"
          value={limit}
          onChange={(event) => setLimit(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
          placeholder="Unlimited"
          className={`${inputClass} w-32`}
        />
        <button type="submit" disabled={pending} className={inkButtonClass}>
          Save limit
        </button>
      </form>

      <div className="mt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(account.plan === "premium" ? "revoke_premium" : "grant_premium")}
          className={account.plan === "premium" ? inkButtonClass : buttonClass}
        >
          {account.plan === "premium" ? "Remove premium" : "Make premium"}
        </button>
      </div>

      {account.isAdmin ? null : (
        <div className="mt-3 flex flex-col gap-2">
          {account.accountStatus !== "restricted" ? (
            <label className="sr-only" htmlFor={`note-${account.id}`}>
              Note for {label}
            </label>
          ) : null}
          {account.accountStatus !== "restricted" ? (
            <textarea
              id={`note-${account.id}`}
              value={note}
              maxLength={500}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note they will see"
              className="max-w-xl rounded-2xl border border-line bg-panel px-4 py-2 text-sm text-fg outline-none focus:border-accent"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {account.accountStatus === "flagged" ? (
              <>
                <button type="button" disabled={pending} onClick={() => act("unflag")} className={buttonClass}>
                  Clear flag
                </button>
                <button type="button" disabled={pending} onClick={() => act("flag")} className={buttonClass}>
                  Update flag
                </button>
              </>
            ) : null}
            {account.accountStatus === "active" ? (
              <button type="button" disabled={pending} onClick={() => act("flag")} className={buttonClass}>
                Flag
              </button>
            ) : null}
            {account.accountStatus === "restricted" ? (
              <button type="button" disabled={pending} onClick={() => act("unrestrict")} className={inkButtonClass}>
                Lift restriction
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => act("restrict")} className={buttonClass}>
                Restrict
              </button>
            )}
          </div>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </li>
  );
}

type AdminView = "overview" | "users" | "allowlist";
type UserFocus = "all" | "premium" | "flagged" | "restricted";

export function AdminConsole({
  admins,
  initialEmails,
  initialAccounts,
}: {
  admins: string[];
  initialEmails: string[];
  initialAccounts: AdminAccount[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [view, setView] = useState<AdminView>("users");
  const [focus, setFocus] = useState<UserFocus>("all");
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(false);

  function openUsers(next: UserFocus) {
    setFocus(next);
    setView("users");
    setRailOpen(false);
  }

  const shown = accounts.filter((account) => {
    if (focus === "premium" && account.plan !== "premium") return false;
    if (focus === "flagged" && account.accountStatus !== "flagged") return false;
    if (focus === "restricted" && account.accountStatus !== "restricted") return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      (account.name || "").toLowerCase().includes(needle) ||
      (account.email || "").toLowerCase().includes(needle)
    );
  });

  const counts = {
    users: accounts.length,
    premium: accounts.filter((account) => account.plan === "premium").length,
    flagged: accounts.filter((account) => account.accountStatus === "flagged").length,
    restricted: accounts.filter((account) => account.accountStatus === "restricted").length,
    allowlist: initialEmails.length,
  };

  const rail = (
    <nav className="flex h-full w-full flex-col border-r border-line bg-oat">
      <div className="space-y-0.5 p-3">
        <RailButton active={view === "overview"} label="Overview" onClick={() => { setView("overview"); setRailOpen(false); }} />
        <RailButton active={view === "users"} label="Users" count={counts.users} onClick={() => openUsers(focus)} />
        <RailButton active={view === "allowlist"} label="Allowlist" count={counts.allowlist} onClick={() => { setView("allowlist"); setRailOpen(false); }} />
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen flex-col bg-oat text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg text-fg hover:bg-oat lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Brand href="/app" />
        <Link href="/app" className="ml-auto text-sm text-muted hover:text-fg">
          App
        </Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-60 shrink-0 lg:flex">{rail}</div>
        {railOpen ? (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button className="absolute inset-0 bg-ink/40" aria-label="Close navigation" onClick={() => setRailOpen(false)} />
            <div className="relative z-10 h-full w-72 shadow-xl">{rail}</div>
          </div>
        ) : null}
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto px-6 py-8">
          {view === "overview" ? (
            <Overview counts={counts} onUsers={openUsers} onAllowlist={() => { setView("allowlist"); setRailOpen(false); }} />
          ) : null}
          {view === "users" ? (
            <section className="mx-auto max-w-3xl">
              <h1 className="font-display text-3xl font-semibold tracking-tight">Users</h1>
              <p className="mt-3 max-w-xl text-muted">
                Set a daily email cap, mark someone premium, or pause and lock an account. They see a notice for each change.
              </p>
              <label className="sr-only" htmlFor="account-filter">
                Find a user
              </label>
              <input
                id="account-filter"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email"
                className="mt-6 w-full max-w-sm rounded-full border border-line bg-panel px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
              {focus !== "all" ? (
                <p className="mt-4 text-sm text-muted">
                  Showing {focus} accounts.{" "}
                  <button type="button" onClick={() => setFocus("all")} className="underline">
                    Show everyone
                  </button>
                </p>
              ) : null}
              {shown.length === 0 ? (
                <p className="mt-8 text-sm text-muted">No accounts match.</p>
              ) : (
                <ul className="mt-6 divide-y divide-line border-y border-line">
                  {shown.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      onUpdated={(next) =>
                        setAccounts((current) => current.map((item) => (item.id === next.id ? next : item)))
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : null}
          {view === "allowlist" ? (
            <section className="mx-auto max-w-lg">
              <AllowlistManager admins={admins} initialEmails={initialEmails} embedded />
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function Overview({
  counts,
  onUsers,
  onAllowlist,
}: {
  counts: { users: number; premium: number; flagged: number; restricted: number; allowlist: number };
  onUsers: (focus: UserFocus) => void;
  onAllowlist: () => void;
}) {
  const rows: { label: string; value: number; onClick: () => void }[] = [
    { label: "Signed-in users", value: counts.users, onClick: () => onUsers("all") },
    { label: "Premium", value: counts.premium, onClick: () => onUsers("premium") },
    { label: "Flagged", value: counts.flagged, onClick: () => onUsers("flagged") },
    { label: "Restricted", value: counts.restricted, onClick: () => onUsers("restricted") },
    { label: "Allowlisted emails", value: counts.allowlist, onClick: onAllowlist },
  ];
  return (
    <section className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Overview</h1>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <li key={row.label}>
            <button type="button" onClick={row.onClick} className="flex w-full items-baseline justify-between gap-4 py-4 text-left hover:text-fg">
              <span className="text-muted">{row.label}</span>
              <span className="font-display text-2xl font-semibold">{row.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RailButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
        active ? "bg-ink font-medium text-white" : "text-fg hover:bg-panel"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null ? (
        <span className={`text-xs tabular-nums ${active ? "text-white/70" : "text-muted"}`}>{count}</span>
      ) : null}
    </button>
  );
}
