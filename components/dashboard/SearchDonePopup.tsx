"use client";

import { useEffect } from "react";
import { CircleAlert, PartyPopper, SearchX, X } from "lucide-react";
import type { SearchJob } from "./types";

function leads(n: number): string {
  return n === 1 ? "1 lead" : `${n} leads`;
}

export function searchOutcome(job: SearchJob): { tone: "win" | "stopped" | "empty"; title: string; body: string } {
  const saved = job.progress.saved;
  const regular = job.params?.mode !== "premium";
  if (job.status === "completed" && saved > 0) {
    return { tone: "win", title: `You just generated ${leads(saved)}.`, body: "Check them out." };
  }
  if (saved > 0) {
    return {
      tone: "stopped",
      title: "Search stopped.",
      body: `${leads(saved)} ${saved === 1 ? "was" : "were"} saved to your CRM.`,
    };
  }
  if (job.status === "failed") {
    return { tone: "empty", title: "This search didn't finish.", body: job.error || "Please try again." };
  }
  if (job.status === "cancelled") {
    return { tone: "empty", title: "Search stopped.", body: "Nothing new was added." };
  }
  return {
    tone: "empty",
    title: "No new leads this time.",
    body: regular
      ? "Run another search to try a different state."
      : "Try other niches or states.",
  };
}

// Shown once per finished search, on whatever view the user is on.
export function SearchDonePopup({
  job,
  onView,
  onDismiss,
}: {
  job: SearchJob;
  onView: () => void;
  onDismiss: () => void;
}) {
  const outcome = searchOutcome(job);
  const saved = job.progress.saved;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // A background tab still shows the result in its title.
  useEffect(() => {
    if (saved <= 0) return;
    const original = document.title;
    document.title = `(${saved}) New leads · ${original}`;
    return () => {
      document.title = original;
    };
  }, [saved]);

  const Icon = outcome.tone === "win" ? PartyPopper : outcome.tone === "stopped" ? CircleAlert : SearchX;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <button className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={onDismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-done-title"
        className="relative w-full max-w-sm rounded-2xl border border-line bg-panel p-6 text-center shadow-xl"
      >
        <button
          onClick={onDismiss}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-oat hover:text-fg"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div
          className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
            outcome.tone === "win" ? "bg-accent text-ink" : "bg-oat text-muted"
          }`}
        >
          <Icon className="h-7 w-7" />
        </div>
        {outcome.tone === "win" ? (
          <p className="mt-4 font-display text-5xl font-semibold tracking-tight text-fg">{saved}</p>
        ) : null}
        <h2 id="search-done-title" className="mt-3 font-display text-xl font-semibold tracking-tight text-fg">
          {outcome.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{outcome.body}</p>
        {job.progress.notice ? <p className="mt-3 text-xs text-muted">{job.progress.notice}</p> : null}
        <div className="mt-6 flex flex-col gap-2">
          {saved > 0 ? (
            <button
              autoFocus
              onClick={onView}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink hover:brightness-95"
            >
              View leads
            </button>
          ) : null}
          <button
            autoFocus={saved === 0}
            onClick={onDismiss}
            className="rounded-full px-5 py-2 text-sm font-medium text-muted hover:text-fg"
          >
            {saved > 0 ? "Later" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
