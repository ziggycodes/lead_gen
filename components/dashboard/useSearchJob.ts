"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSearchActive, type SearchJob } from "./types";

const POLL_MS = 2000;

export interface SearchInput {
  niches?: string;
  states?: string;
  limit?: number;
}

// Searches run on the server. This hook finds the user's running search on load,
// polls it, and holds the finished one until its popup is dismissed.
export function useSearchJob({
  onSaved,
  onFinished,
}: {
  onSaved: () => void;
  onFinished: (job: SearchJob) => void;
}) {
  const [job, setJob] = useState<SearchJob | null>(null);
  const [finished, setFinished] = useState<SearchJob | null>(null);
  const savedRef = useRef(0);
  const callbacks = useRef({ onSaved, onFinished });
  callbacks.current = { onSaved, onFinished };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/searches?active=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        if (json.active) {
          savedRef.current = json.active.progress.saved;
          setJob(json.active);
        } else if (json.unseen) {
          setFinished(json.unseen);
        }
      })
      .catch(() => {
        /* the next search start reports any real problem */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const running = isSearchActive(job);
  const jobId = job?.id ?? null;

  useEffect(() => {
    if (!running || jobId == null) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/searches/${jobId}`);
        if (!res.ok || stopped) return;
        const next = (await res.json()).search as SearchJob;
        if (stopped) return;
        setJob(next);
        if (next.progress.saved !== savedRef.current) {
          savedRef.current = next.progress.saved;
          callbacks.current.onSaved();
        }
        if (!isSearchActive(next)) {
          setFinished(next);
          callbacks.current.onFinished(next);
        }
      } catch {
        // A dropped connection only skips a tick; the search keeps running on the server.
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [running, jobId]);

  const follow = useCallback((next: SearchJob) => {
    savedRef.current = next.progress.saved;
    setFinished(null);
    setJob(next);
  }, []);

  // Returns an error message, or null when the search started.
  const start = useCallback(
    async (input: SearchInput): Promise<string | null> => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.search) {
          follow(json.search);
          return null;
        }
        // Already running: pick that search up instead of leaving the user stuck.
        if (res.status === 409 && typeof json.searchId === "number") {
          const current = await fetch(`/api/searches/${json.searchId}`).then((r) => (r.ok ? r.json() : null));
          if (current?.search) {
            follow(current.search);
            return null;
          }
        }
        return typeof json.error === "string" ? json.error : `Search failed (${res.status}).`;
      } catch {
        return "Could not reach LeadScout. Check your connection and try again.";
      }
    },
    [follow]
  );

  const cancel = useCallback(async () => {
    if (jobId == null) return;
    try {
      const res = await fetch(`/api/searches/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.search) return;
      const next = json.search as SearchJob;
      setJob(next);
      // A queued search ends right away, so polling never sees it finish.
      if (!isSearchActive(next)) {
        setFinished(next);
        callbacks.current.onFinished(next);
      }
    } catch {
      /* polling picks up the cancel once it lands */
    }
  }, [jobId]);

  const finishedId = finished?.id ?? null;
  const dismiss = useCallback(() => {
    if (finishedId == null) return;
    setFinished(null);
    fetch(`/api/searches/${finishedId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen" }),
    }).catch(() => {});
  }, [finishedId]);

  return { job, running, finished, start, cancel, dismiss };
}
