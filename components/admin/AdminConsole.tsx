"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { AllowlistManager } from "@/components/admin/AllowlistManager";
import { Brand } from "@/components/Brand";
import { ActivityView } from "./ActivityView";
import { OverviewView } from "./OverviewView";
import { SearchesView } from "./SearchesView";
import { UserDrawer } from "./UserDrawer";
import { UsersTable } from "./UsersTable";
import type { AdminAccount, AdminSearchStatus, AdminView, OverviewStats, UserFocus } from "./types";

export type { AdminAccount } from "./types";

export function AdminConsole({
  admins,
  initialEmails,
  initialAccounts,
  initialStats,
}: {
  admins: string[];
  initialEmails: string[];
  initialAccounts: AdminAccount[];
  initialStats: OverviewStats;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [view, setView] = useState<AdminView>("overview");
  const [focus, setFocus] = useState<UserFocus>("all");
  const [searchStatus, setSearchStatus] = useState<AdminSearchStatus | "all">("all");
  const [openUserId, setOpenUserId] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState(false);

  function go(next: AdminView) {
    setView(next);
    setRailOpen(false);
  }

  function openSearches(status?: AdminSearchStatus) {
    setSearchStatus(status ?? "all");
    go("searches");
  }

  const openAccount = openUserId == null ? null : accounts.find((account) => account.id === openUserId) ?? null;
  const attentionCount = initialStats.attention.length;

  const rail = (
    <nav className="flex h-full w-full flex-col border-r border-line bg-oat">
      <div className="space-y-0.5 p-3">
        <RailButton active={view === "overview"} label="Overview" count={attentionCount || undefined} onClick={() => go("overview")} />
        <RailButton active={view === "users"} label="Users" count={accounts.length} onClick={() => go("users")} />
        <RailButton active={view === "searches"} label="Searches" onClick={() => openSearches()} />
        <RailButton active={view === "activity"} label="Activity" onClick={() => go("activity")} />
        <RailButton active={view === "allowlist"} label="Allowlist" count={initialEmails.length} onClick={() => go("allowlist")} />
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
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
          {view === "overview" ? (
            <OverviewView
              initialStats={initialStats}
              onOpenUser={setOpenUserId}
              onOpenUsers={() => {
                setFocus("all");
                go("users");
              }}
              onOpenSearches={openSearches}
            />
          ) : null}
          {view === "users" ? (
            <UsersTable accounts={accounts} focus={focus} onFocus={setFocus} onOpen={setOpenUserId} />
          ) : null}
          {view === "searches" ? <SearchesView initialStatus={searchStatus} onOpenUser={setOpenUserId} /> : null}
          {view === "activity" ? <ActivityView onOpenUser={setOpenUserId} /> : null}
          {view === "allowlist" ? (
            <section className="mx-auto max-w-lg">
              <AllowlistManager admins={admins} initialEmails={initialEmails} embedded />
            </section>
          ) : null}
        </main>
      </div>
      {openAccount ? (
        <UserDrawer
          key={openAccount.id}
          account={openAccount}
          onClose={() => setOpenUserId(null)}
          onUpdated={(next) => setAccounts((current) => current.map((item) => (item.id === next.id ? next : item)))}
        />
      ) : null}
    </div>
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
