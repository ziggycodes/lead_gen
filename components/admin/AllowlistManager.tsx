"use client";

import { useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export function AllowlistManager({
  admins,
  initialEmails,
}: {
  admins: string[];
  initialEmails: string[];
}) {
  const [emails, setEmails] = useState(initialEmails);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const invited = emails.filter((email) => !admins.includes(email));

  async function addEmail(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not add that email.");
        return;
      }
      setEmails((current) => (current.includes(data.email) ? current : [...current, data.email]));
      setDraft("");
    } catch {
      setError("Could not add that email. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function removeEmail(email: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/allowlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not remove that email.");
        return;
      }
      setEmails((current) => current.filter((item) => item !== email));
    } catch {
      setError("Could not remove that email. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Brand href="/app" />
        <Link href="/app" className="text-sm text-muted hover:text-fg">
          Dashboard
        </Link>
      </div>

      <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight">Who can sign in</h1>
      <p className="mt-3 text-muted">
        Add an email and that person can create an account and use LeadScout. Remove it and they lose access on their next visit.
      </p>

      <form onSubmit={addEmail} className="mt-8 flex gap-2">
        <label className="sr-only" htmlFor="allow-email">
          Email address
        </label>
        <input
          id="allow-email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="name@company.com"
          className="min-w-0 flex-1 rounded-full border border-line bg-panel px-4 py-2.5 text-sm text-fg outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add email
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <ul className="mt-8 divide-y divide-line border-y border-line">
        {admins.map((email) => (
          <li key={email} className="flex items-center justify-between gap-4 py-3 text-sm">
            <span className="truncate">{email}</span>
            <span className="shrink-0 text-muted">Always allowed</span>
          </li>
        ))}
        {invited.map((email) => (
          <li key={email} className="flex items-center justify-between gap-4 py-3 text-sm">
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={() => removeEmail(email)}
              disabled={pending}
              className="shrink-0 text-danger hover:opacity-80 disabled:opacity-40"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {invited.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No other emails yet. Add one above.</p>
      ) : null}
    </main>
  );
}
