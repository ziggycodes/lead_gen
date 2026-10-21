"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatDateTime } from "./format";

type ThreadSummary = {
  counterparty: string;
  subject: string;
  preview: string;
  lastAt: string;
  direction: string;
  accountId: number;
  accountAddress: string;
  leadId: number | null;
  leadName: string | null;
};

type MailMessage = {
  id: number;
  accountId: number;
  accountAddress: string;
  direction: string;
  subject: string;
  bodyText: string;
  sentAt: string;
  fromAddress: string;
  toAddress: string;
  leadId: number | null;
};

type ThreadDetail = {
  counterparty: string;
  lead: { id: number; name: string; status: string } | null;
  messages: MailMessage[];
};

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => ({}));
  return json.error || `Request failed (${res.status})`;
}

export function ConversationsView({
  focusEmail,
  onOpenLead,
}: {
  focusEmail: string | null;
  onOpenLead: (id: number) => void;
}) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(focusEmail);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadThread = useCallback(async (address: string) => {
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/conversations?address=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error(await readError(res));
      setThread(await res.json());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async (pick?: string | null) => {
      setLoading(true);
      try {
        const res = await fetch("/api/conversations/sync", { method: "POST" });
        if (!res.ok) throw new Error(await readError(res));
        const json = await res.json();
        const next = (json.threads || []) as ThreadSummary[];
        setThreads(next);
        const problems = (json.syncErrors || []) as { address: string; error: string }[];
        setSyncNote(problems.length ? problems.map((item) => `${item.address}: ${item.error}`).join(" ") : null);
        const wanted = (pick || "").trim().toLowerCase();
        const chosen = wanted || next[0]?.counterparty || null;
        setSelected(chosen);
        if (chosen) await loadThread(chosen);
        else setThread(null);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadThread]
  );

  useEffect(() => {
    refresh(focusEmail);
  }, [refresh, focusEmail]);

  const open = (address: string) => {
    setSelected(address);
    setReply("");
    loadThread(address);
  };

  const latest = thread?.messages[thread.messages.length - 1];
  const subject = latest?.subject
    ? /^re:/i.test(latest.subject)
      ? latest.subject
      : `Re: ${latest.subject}`
    : "";

  const sendReply = async () => {
    if (!thread || !latest || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: latest.accountId,
          to: thread.counterparty,
          subject,
          body: reply,
          leadId: thread.lead?.id ?? latest.leadId,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setReply("");
      await loadThread(thread.counterparty);
      const list = await fetch("/api/conversations");
      if (list.ok) {
        const json = await list.json();
        setThreads(json.threads || []);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h1 className="font-display text-lg font-semibold tracking-tight text-fg">Conversations</h1>
        <button
          onClick={() => refresh(selected)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:text-fg"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
      {syncNote && <p className="border-b border-line px-4 py-2 text-xs text-danger sm:px-5">{syncNote}</p>}
      {error && <p className="border-b border-line px-4 py-2 text-xs text-danger sm:px-5">{error}</p>}

      <div className="flex min-h-0 flex-1">
        <aside className={`w-full shrink-0 border-r border-line lg:w-80 ${selected ? "hidden lg:block" : "block"}`}>
          {loading && threads.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">Reading mailboxes…</p>
          ) : threads.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              No conversations yet. Send a lead an email and the thread, including their reply, shows up here.
            </p>
          ) : (
            <ul className="scroll-thin h-full overflow-y-auto">
              {threads.map((item) => (
                <li key={item.counterparty}>
                  <button
                    onClick={() => open(item.counterparty)}
                    className={`block w-full border-b border-line px-4 py-3 text-left ${
                      selected === item.counterparty ? "bg-oat" : "hover:bg-oat/60"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.leadName || item.counterparty}</span>
                      <span className="shrink-0 text-[11px] text-muted">{formatDateTime(item.lastAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {item.direction === "inbound" ? "Received" : "Sent"}
                      {item.subject ? ` · ${item.subject}` : ""}
                    </span>
                    {item.preview && <span className="mt-1 block truncate text-xs text-fg/80">{item.preview}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={`min-w-0 flex-1 flex-col ${selected ? "flex" : "hidden lg:flex"}`}>
          {!selected || !thread ? (
            <p className="px-5 py-6 text-sm text-muted">{threadLoading || loading ? "Opening the thread…" : "Select a conversation."}</p>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <button onClick={() => setSelected(null)} className="text-xs font-medium text-muted lg:hidden">
                  Back
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{thread.lead?.name || thread.counterparty}</p>
                  <p className="truncate text-xs text-muted">{thread.counterparty}</p>
                </div>
                {thread.lead && (
                  <button
                    onClick={() => onOpenLead(thread.lead!.id)}
                    className="ml-auto shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium"
                  >
                    Open lead
                  </button>
                )}
              </div>
              <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {thread.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-xl rounded-xl px-3 py-2.5 text-sm ${
                      message.direction === "outbound" ? "ml-auto bg-ink text-white" : "bg-oat text-fg"
                    }`}
                  >
                    <p className={`text-[11px] ${message.direction === "outbound" ? "text-white/70" : "text-muted"}`}>
                      {message.direction === "outbound" ? "Sent" : "Received"}
                      {" · "}
                      {message.accountAddress}
                      {" · "}
                      {formatDateTime(message.sentAt)}
                    </p>
                    {message.subject && <p className="mt-1 font-medium">{message.subject}</p>}
                    <p className="mt-1 whitespace-pre-wrap">{message.bodyText || "No message text."}</p>
                  </article>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendReply();
                }}
                className="border-t border-line px-4 py-3"
              >
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder={`Reply to ${thread.counterparty}`}
                  className="w-full resize-none rounded-lg border border-line bg-oat px-3 py-2 text-sm outline-none focus:border-accent focus:bg-panel"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted">Sends from {latest?.accountAddress}</p>
                  <button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
