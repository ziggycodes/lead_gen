"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { ActionLine } from "./ActivityView";
import { SearchStatusBadge } from "./SearchesView";
import { StatusBadge } from "./UsersTable";
import { buttonClass, inkButtonClass, inputClass, type AccountDetail, type AdminAccount } from "./types";
import { formatAgo, formatCount, formatDate, formatDateTime, formatNgn } from "./format";

type AccountAction =
  | "set_limit"
  | "flag"
  | "unflag"
  | "restrict"
  | "unrestrict"
  | "grant_premium"
  | "revoke_premium";

export function UserDrawer({
  account,
  onUpdated,
  onClose,
}: {
  account: AdminAccount;
  onUpdated: (next: AdminAccount) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setDetailError(null);
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailError(typeof data.error === "string" ? data.error : "Could not load this account's history.");
        return;
      }
      setDetail(data.detail as AccountDetail);
    } catch {
      setDetailError("Could not load this account's history. Check your connection and try again.");
    }
  }, [account.id]);

  useEffect(() => {
    setDetail(null);
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = account.name || account.email || "No email on this account";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button className="absolute inset-0 bg-ink/40" aria-label="Close user details" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${label}`}
        className="scroll-thin relative z-10 h-full w-full overflow-y-auto bg-oat shadow-xl sm:max-w-xl"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-panel px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold">{label}</p>
            {account.name && account.email ? <p className="truncate text-sm text-muted">{account.email}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusBadge status={account.accountStatus} />
              <span>{account.plan === "premium" ? "Premium" : "Regular"}</span>
              {account.isAdmin ? <span>· Admin</span> : null}
              <span>· Joined {formatDate(account.createdAt)}</span>
              {account.country ? <span>· {account.country}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-oat"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-8 px-5 py-6">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="Leads" value={formatCount(account.leadCount)} hint={`${formatCount(account.leadsWithEmail)} with email`} />
            <Stat
              label="Emails today"
              value={
                account.emailDailyLimit == null
                  ? formatCount(account.emailsFoundToday)
                  : `${account.emailsFoundToday} / ${account.emailDailyLimit}`
              }
              hint={account.emailDailyLimit == null ? "No daily cap" : "Daily cap"}
            />
            <Stat label="Balance" value={formatCount(account.balance)} hint={`${formatCount(account.totalConsumed)} used all time`} />
            <Stat label="Last search" value={formatAgo(account.lastSearchAt)} />
            <Stat label="Mailbox" value={account.hasMailbox ? "Connected" : "None"} />
          </dl>

          {account.accountNote ? (
            <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm">They see: {account.accountNote}</p>
          ) : null}

          <AccountActions
            account={account}
            onUpdated={(next) => {
              onUpdated(next);
              void loadDetail();
            }}
          />

          {detailError ? <p className="text-sm text-danger">{detailError}</p> : null}
          {!detail && !detailError ? <p className="text-sm text-muted">Loading history…</p> : null}
          {detail ? (
            <>
              <DetailSection title="Recent searches" empty="No searches yet." count={detail.searches.length}>
                {detail.searches.map((search) => (
                  <li key={search.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">
                        #{search.id} · {search.states || "US"} · {formatCount(search.leadCount)} leads
                      </span>
                      <span className="block text-xs text-muted">
                        {formatDateTime(search.createdAt)}
                        {search.error ? ` · ${search.error}` : ""}
                      </span>
                    </span>
                    <SearchStatusBadge status={search.status} />
                  </li>
                ))}
              </DetailSection>
              <DetailSection title="Payments" empty="No payments." count={detail.payments.length}>
                {detail.payments.map((payment) => (
                  <li key={payment.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span>
                      {formatNgn(payment.amountNgn)} · {formatCount(payment.credits)} credits
                      <span className="block text-xs text-muted">{formatDateTime(payment.createdAt)}</span>
                    </span>
                    <span className={`text-xs ${payment.status === "failed" ? "text-danger" : "text-muted"}`}>
                      {payment.status}
                    </span>
                  </li>
                ))}
              </DetailSection>
              <DetailSection title="Admin changes" empty="No admin changes yet." count={detail.actions.length}>
                {detail.actions.map((entry) => (
                  <li key={entry.id} className="py-2">
                    <ActionLine entry={entry} showTarget={false} />
                  </li>
                ))}
              </DetailSection>
              <DetailSection title="Notices sent" empty="No notices sent." count={detail.notices.length}>
                {detail.notices.map((notice) => (
                  <li key={notice.id} className="py-2 text-sm">
                    {notice.body}
                    <span className="block text-xs text-muted">
                      {formatDateTime(notice.createdAt)} · {notice.readAt ? "Read" : "Unread"}
                    </span>
                  </li>
                ))}
              </DetailSection>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

function DetailSection({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {count === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-y border-line">{children}</ul>
      )}
    </section>
  );
}

function AccountActions({ account, onUpdated }: { account: AdminAccount; onUpdated: (next: AdminAccount) => void }) {
  const [limit, setLimit] = useState(account.emailDailyLimit == null ? "" : String(account.emailDailyLimit));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const label = account.name || account.email || "No email on this account";

  async function act(action: AccountAction) {
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

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Controls</h3>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void act("set_limit");
        }}
      >
        <label className="text-sm text-muted" htmlFor={`limit-${account.id}`}>
          Daily email cap
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
          Save cap
        </button>
      </form>

      <div>
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
        <div className="flex flex-col gap-2">
          {account.accountStatus !== "restricted" ? (
            <>
              <label className="sr-only" htmlFor={`note-${account.id}`}>
                Note for {label}
              </label>
              <textarea
                id={`note-${account.id}`}
                value={note}
                maxLength={500}
                rows={2}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Note they will see (required to flag or restrict)"
                className="rounded-2xl border border-line bg-panel px-4 py-2 text-sm text-fg outline-none focus:border-accent"
              />
            </>
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
              <button
                type="button"
                disabled={pending}
                onClick={() => act("restrict")}
                className={`${buttonClass} text-danger`}
              >
                Restrict
              </button>
            )}
          </div>
        </div>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </section>
  );
}
