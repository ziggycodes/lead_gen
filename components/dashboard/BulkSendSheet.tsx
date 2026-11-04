"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Mail, X } from "lucide-react";
import { DateTime } from "luxon";
import { planRecipients } from "@/lib/mail/bulkRules";
import { renderTemplate, templateFields } from "@/lib/mail/merge";
import { isRestrictedBulkHost, sendingDaysNeeded } from "@/lib/mail/warmup";
import {
  cancelBulkSend,
  fetchBulkSends,
  fetchConnectedMailboxes,
  fetchLeads,
  fetchTemplates,
  startBulkSend,
  type Mailbox,
} from "./crmApi";
import type { BulkSend, CrmLead, EmailTemplate } from "./types";

// Mirrors MAX_BULK_RECIPIENTS in lib/mail/bulk.ts.
const MAX_RECIPIENTS = 200;

const selectClass =
  "mt-1 w-full rounded-lg border border-line bg-oat px-2 py-1.5 text-sm outline-none focus:border-accent";

function pacingNote(mailbox: Mailbox, count: number) {
  const { cap, remainingToday, sentToday } = mailbox.warmup;
  const days = sendingDaysNeeded(mailbox, count, sentToday, new Date());
  const span = days <= 1 ? "about 1 sending day" : `about ${days} sending days`;
  return `This mailbox can send ${cap} a day right now, with ${remainingToday} left today. ${count} ${
    count === 1 ? "email" : "emails"
  } will take ${span}, sent 8am to 6pm on weekdays. You can leave this page.`;
}

export function BulkSendSheet({
  leads,
  onClose,
  onStarted,
  onOpenMailboxes,
}: {
  leads: CrmLead[];
  onClose: () => void;
  onStarted: (send: BulkSend) => void;
  onOpenMailboxes?: () => void;
}) {
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [accountId, setAccountId] = useState<number | "">("");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showSkipped, setShowSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnectedMailboxes()
      .then((rows) => {
        setMailboxes(rows);
        const preferred = rows.find((m) => m.isDefault) || rows[0];
        if (preferred) setAccountId(preferred.id);
      })
      .catch((err) => setError((err as Error).message));
    fetchTemplates()
      .then(({ templates: rows }) => {
        setTemplates(rows);
        if (rows[0]) setTemplateId(rows[0].id);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mailbox = mailboxes?.find((m) => m.id === accountId) ?? null;
  const template = templates?.find((t) => t.id === templateId) ?? null;
  const overLimit = leads.length > MAX_RECIPIENTS;
  const plan = useMemo(() => (template ? planRecipients(leads, template) : null), [leads, template]);
  const usesAi = template ? templateFields(template).some((f) => f.startsWith("ai")) : false;
  const previewLead = plan?.send[Math.min(previewIndex, Math.max(0, plan.send.length - 1))];
  const preview = template && previewLead ? renderTemplate(template, previewLead) : null;

  const submit = async () => {
    if (!template || accountId === "" || !plan?.send.length) return;
    setBusy(true);
    setError(null);
    try {
      const { send } = await startBulkSend({ accountId, templateId: template.id, leadIds: leads.map((l) => l.id) });
      onStarted(send);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loading = mailboxes === null || templates === null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Email selected leads"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl bg-panel shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-semibold">Email {leads.length} leads</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-full hover:bg-oat">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading mailboxes and templates…
            </p>
          ) : mailboxes.length === 0 ? (
            <p className="text-sm text-muted">
              Connect a mailbox first.{" "}
              <button onClick={onOpenMailboxes} className="font-medium text-fg underline">
                Go to Mailboxes
              </button>
            </p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted">
              Create an email template first.{" "}
              <button onClick={onOpenMailboxes} className="font-medium text-fg underline">
                Go to Mailboxes &amp; templates
              </button>
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-xs font-medium text-muted">From</span>
                  <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} className={selectClass}>
                    {mailboxes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.address}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-muted">Template</span>
                  <select
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(Number(e.target.value));
                      setPreviewIndex(0);
                    }}
                    className={selectClass}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {overLimit && (
                <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                  Select {MAX_RECIPIENTS} leads or fewer per bulk send.
                </p>
              )}

              {mailbox && isRestrictedBulkHost(mailbox.smtpHost) && (
                <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                  Zoho&apos;s usage policy says Zoho Mail can&apos;t be used for bulk or automated email, and it can block
                  accounts that do. Consider a host that allows outreach.
                </p>
              )}

              {plan && (
                <div className="rounded-xl border border-line bg-oat px-4 py-3 text-sm">
                  <p>
                    <span className="font-semibold">{plan.send.length} will be emailed</span>
                    {plan.skip.length > 0 && (
                      <>
                        {" · "}
                        <button onClick={() => setShowSkipped((v) => !v)} className="text-muted underline">
                          {plan.skip.length} skipped
                        </button>
                      </>
                    )}
                  </p>
                  {plan.send.length > 0 && mailbox && (
                    <p className="mt-0.5 text-xs text-muted">{pacingNote(mailbox, plan.send.length)}</p>
                  )}
                  {usesAi && (
                    <p className="mt-0.5 text-xs text-muted">
                      This template uses AI fields. Leads without confident AI research are skipped unless the field has
                      a fallback.
                    </p>
                  )}
                  {showSkipped && (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                      {plan.skip.map(({ lead, reason }) => (
                        <li key={lead.id} className="flex justify-between gap-3">
                          <span className="truncate">{lead.name}</span>
                          <span className="shrink-0 text-muted">{reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {preview && previewLead && plan && (
                <div className="rounded-xl border border-line">
                  <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs text-muted">
                    <span className="truncate">
                      Preview for <span className="font-medium text-fg">{previewLead.name}</span> · {previewLead.email}
                    </span>
                    {plan.send.length > 1 && (
                      <span className="flex shrink-0 gap-2">
                        <button onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))} disabled={previewIndex === 0}>
                          ‹ Prev
                        </button>
                        <button
                          onClick={() => setPreviewIndex((i) => Math.min(plan.send.length - 1, i + 1))}
                          disabled={previewIndex >= plan.send.length - 1}
                        >
                          Next ›
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3 text-sm">
                    <p className="font-semibold">{preview.subject}</p>
                    <p className="mt-2 whitespace-pre-wrap text-fg">{preview.body}</p>
                  </div>
                </div>
              )}
            </>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={onClose} className="rounded-full px-3 py-1.5 text-xs font-medium text-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || overLimit || !plan?.send.length || accountId === ""}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5" />
            {busy ? "Starting…" : `Send ${plan?.send.length ?? 0} emails`}
          </button>
        </div>
      </div>
    </div>
  );
}

const ACTIVE = new Set(["queued", "running"]);
const RECENT_MS = 60 * 60 * 1000;

// Strips shown in the CRM while batches are sending. Polls until they finish and
// refreshes leads as they move to Contacted. Each mailbox can run its own batch.
export function BulkSendProgress({
  started,
  onLeadsRefreshed,
}: {
  started: BulkSend | null;
  onLeadsRefreshed: (leads: CrmLead[]) => void;
}) {
  const [sends, setSends] = useState<BulkSend[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const lastSent = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const { sends: latest } = await fetchBulkSends();
        if (stopped) return;
        setSends(latest);
        const sentTotal = latest.reduce((sum, send) => sum + send.sent, 0);
        if (lastSent.current !== null && sentTotal !== lastSent.current) {
          const { leads } = await fetchLeads();
          if (!stopped) onLeadsRefreshed(leads);
        }
        lastSent.current = sentTotal;
        if (latest.some((send) => ACTIVE.has(send.status))) timer = window.setTimeout(poll, 15_000);
      } catch {
        if (!stopped) timer = window.setTimeout(poll, 30_000);
      }
    };
    poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [started, onLeadsRefreshed]);

  // Only show finished batches from the last hour.
  const visible = sends.filter(
    (send) =>
      !dismissed.includes(send.id) &&
      (ACTIVE.has(send.status) || (send.completedAt && Date.now() - Date.parse(send.completedAt) <= RECENT_MS))
  );
  if (!visible.length) return null;

  return (
    <div className="space-y-2">
      {visible.map((send) => (
        <BulkSendStrip
          key={send.id}
          send={send}
          onCancelled={(updated) => setSends((rows) => rows.map((row) => (row.id === updated.id ? updated : row)))}
          onDismiss={() => setDismissed((ids) => [...ids, send.id])}
        />
      ))}
    </div>
  );
}

function BulkSendStrip({
  send,
  onCancelled,
  onDismiss,
}: {
  send: BulkSend;
  onCancelled: (send: BulkSend) => void;
  onDismiss: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const active = ACTIVE.has(send.status);
  const done = send.sent + send.skipped + send.failed;
  const label = active
    ? `Sending ${send.sent} of ${send.total - send.skipped}`
    : send.status === "completed"
      ? `Bulk send finished: ${send.sent} sent`
      : send.status === "cancelled"
        ? `Bulk send cancelled: ${send.sent} sent`
        : `Bulk send stopped: ${send.sent} sent`;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-oat px-3 py-2 text-sm">
      {active && !send.resumeAt && <LoaderCircle className="h-4 w-4 animate-spin text-muted" />}
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-muted">
        {send.skipped} skipped{send.failed ? ` · ${send.failed} failed` : ""}
      </span>
      {active && send.resumeAt && (
        <span className="text-xs text-muted">
          Paused for this mailbox&apos;s sending limit. Resumes {DateTime.fromISO(send.resumeAt).toFormat("ccc HH:mm")}
        </span>
      )}
      {active && send.total > 0 && (
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
          <span className="block h-full bg-accent" style={{ width: `${(done / send.total) * 100}%` }} />
        </span>
      )}
      <span className="ml-auto">
        {active ? (
          <button
            disabled={cancelling}
            onClick={async () => {
              setCancelling(true);
              try {
                const { send: updated } = await cancelBulkSend(send.id);
                onCancelled(updated);
              } catch {
                /* the next poll shows the real state */
              } finally {
                setCancelling(false);
              }
            }}
            className="rounded-full px-3 py-1 text-xs font-medium text-danger disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        ) : (
          <button onClick={onDismiss} aria-label="Dismiss" className="grid h-6 w-6 place-items-center rounded-full hover:bg-panel">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}
