"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Star,
  Phone,
  Globe,
  Mail,
  MapPin,
  Copy,
  Check,
  ExternalLink,
  Users,
  User,
  Pencil,
  Trash2,
  CalendarClock,
  LoaderCircle,
  StickyNote,
  History,
  CircleAlert,
  Search,
  Sparkles,
} from "lucide-react";
import { LEAD_STATUSES, STATUS_LABELS, isLeadStatus } from "@/lib/crm";
import type { CrmLead, EmailTemplate, LeadActivity, LeadNote } from "./types";
import { renderTemplate } from "@/lib/mail/merge";
import {
  addNote,
  deleteLead,
  deleteNote,
  fetchLeadDetail,
  fetchOfferProfile,
  fetchTemplates,
  lookupDecisionMakers,
  updateLead,
} from "./crmApi";
import { formatDate, formatDateTime, isFollowUpDue, location, toDateInput } from "./format";
import { StatusPill } from "./StatusPill";
import { AiResearchBlock } from "./AiResearchBlock";

type EditForm = Record<
  "name" | "contactName" | "email" | "phone" | "website" | "address" | "city" | "state",
  string
>;

const FIELD_LABELS: Record<string, string> = {
  name: "business name",
  contactName: "contact name",
  email: "email",
  phone: "phone",
  website: "website",
  address: "address",
  city: "city",
  state: "state",
};

function statusLabel(s: unknown): string {
  return isLeadStatus(s) ? STATUS_LABELS[s] : String(s ?? "");
}

function describeActivity(a: LeadActivity): string {
  const d = a.detail || {};
  switch (a.type) {
    case "imported":
      if (d.via === "saved") return "Imported from saved leads";
      if (d.via === "history") return "Imported from search history";
      return "Added from a search";
    case "status_changed":
      return `Status changed from ${statusLabel(d.from)} to ${statusLabel(d.to)}`;
    case "unsubscribed":
      return "Unsubscribed from your emails";
    case "saved":
      return "Saved";
    case "unsaved":
      return "Removed from saved";
    case "note_added":
      return "Note added";
    case "updated": {
      const fields = Array.isArray(d.fields) ? (d.fields as string[]) : [];
      return fields.length
        ? `Updated ${fields.map((f) => FIELD_LABELS[f] || f).join(", ")}`
        : "Details updated";
    }
    case "follow_up_set":
      return d.at ? `Follow-up set for ${formatDate(String(d.at))}` : "Follow-up cleared";
    case "decision_makers_found":
      return `Found ${d.count ?? ""} decision maker${d.count === 1 ? "" : "s"}`;
    case "email_sent":
      return d.to ? `Email sent to ${d.to}` : "Email sent";
    case "email_received":
      return d.from ? `Reply from ${d.from}` : "Reply received";
    default:
      return a.type;
  }
}

export function leadToText(l: CrmLead): string {
  const dmLines = (l.decisionMakers || []).map(
    (dm) => `Decision maker: ${dm.name}${dm.title ? ` (${dm.title})` : ""} ${dm.url}`
  );
  return [
    l.name,
    `Status: ${statusLabel(l.status)}`,
    l.niche && `Niche: ${l.niche}`,
    (l.city || l.state) && `Location: ${location(l.city, l.state)}`,
    l.contactName && `Contact: ${l.contactName}`,
    l.phone && `Phone: ${l.phone}`,
    l.website && `Website: ${l.website}`,
    l.email && `Email: ${l.email}`,
    l.address && `Address: ${l.address}`,
    ...dmLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function formFromLead(l: CrmLead): EditForm {
  return {
    name: l.name,
    contactName: l.contactName,
    email: l.email,
    phone: l.phone,
    website: l.website,
    address: l.address,
    city: l.city,
    state: l.state,
  };
}

export function LeadDrawer({
  leadId,
  onClose,
  onLeadChange,
  onLeadDeleted,
  onOpenConversation,
  onOpenMailboxes,
  embedded = false,
}: {
  leadId: number | null;
  onClose: () => void;
  onLeadChange: (lead: CrmLead) => void;
  onLeadDeleted: (id: number) => void;
  onOpenConversation?: (email: string) => void;
  onOpenMailboxes?: () => void;
  embedded?: boolean;
}) {
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [dmLoading, setDmLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mailboxes, setMailboxes] = useState<{ id: number; address: string; isDefault: boolean; status: string }[]>([]);
  const [composing, setComposing] = useState(false);
  const [mailAccountId, setMailAccountId] = useState<number | "">("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  const applyDetail = useCallback(
    (d: { lead: CrmLead; notes: LeadNote[]; activities: LeadActivity[] }) => {
      setLead(d.lead);
      setNotes(d.notes);
      setActivities(d.activities);
      onLeadChange(d.lead);
    },
    [onLeadChange]
  );

  useEffect(() => {
    setLead(null);
    setNotes([]);
    setActivities([]);
    setError(null);
    setEditing(false);
    setNoteDraft("");
    setConfirmDelete(false);
    setCopied(false);
    setComposing(false);
    setMailSubject("");
    setMailBody("");
    if (leadId === null) return;

    let cancelled = false;
    setLoading(true);
    fetchLeadDetail(leadId)
      .then((d) => {
        if (cancelled) return;
        setLead(d.lead);
        setNotes(d.notes);
        setActivities(d.activities);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  useEffect(() => {
    if (leadId === null) return;
    let cancelled = false;
    fetch("/api/email-accounts")
      .then((res) => (res.ok ? res.json() : { mailboxes: [] }))
      .then((json) => {
        if (cancelled) return;
        const rows = (json.mailboxes || []) as { id: number; address: string; isDefault: boolean; status: string }[];
        const connected = rows.filter((row) => row.status === "connected");
        setMailboxes(connected);
        const preferred = connected.find((row) => row.isDefault) || connected[0];
        setMailAccountId(preferred ? preferred.id : "");
      })
      .catch(() => {
        if (!cancelled) setMailboxes([]);
      });
    fetchTemplates()
      .then(({ templates: rows }) => !cancelled && setTemplates(rows))
      .catch(() => {});
    fetchOfferProfile()
      .then((json) => !cancelled && setAiEnabled(json.ai === "available"))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (leadId !== null) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leadId, onClose]);

  if (leadId === null) {
    if (!embedded) return null;
    return (
      <aside className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-panel px-8 text-center">
        <p className="font-display text-base font-semibold">No lead open</p>
        <p className="mt-1.5 max-w-64 text-sm text-muted">
          Select a business to see notes, follow-ups, and contact details.
        </p>
      </aside>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patch = (body: Parameters<typeof updateLead>[1]) =>
    run(async () => {
      if (!lead) return;
      applyDetail(await updateLead(lead.id, body));
    });

  const saveEdits = () =>
    run(async () => {
      if (!lead || !form) return;
      applyDetail(await updateLead(lead.id, { fields: form }));
      setEditing(false);
    });

  const submitNote = () =>
    run(async () => {
      if (!lead || !noteDraft.trim()) return;
      await addNote(lead.id, noteDraft);
      setNoteDraft("");
      applyDetail(await fetchLeadDetail(lead.id));
    });

  const removeNote = (noteId: number) =>
    run(async () => {
      if (!lead) return;
      await deleteNote(lead.id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    });

  const sendLeadMail = () =>
    run(async () => {
      if (!lead?.email || mailAccountId === "") return;
      if (!mailSubject.trim() || !mailBody.trim()) {
        throw new Error("Add a subject and a message.");
      }
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: mailAccountId,
          to: lead.email,
          subject: mailSubject,
          body: mailBody,
          leadId: lead.id,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not send that email.");
      setComposing(false);
      setMailSubject("");
      setMailBody("");
      applyDetail(await fetchLeadDetail(lead.id));
      onOpenConversation?.(lead.email);
    });

  const findDecisionMakers = async () => {
    if (!lead) return;
    setDmLoading(true);
    setError(null);
    try {
      await lookupDecisionMakers(lead.id);
      applyDetail(await fetchLeadDetail(lead.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDmLoading(false);
    }
  };

  const remove = () =>
    run(async () => {
      if (!lead) return;
      await deleteLead(lead.id);
      onLeadDeleted(lead.id);
      onClose();
    });

  const copyDetails = async () => {
    if (!lead) return;
    try {
      await navigator.clipboard.writeText(leadToText(lead));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const followUpDue = lead ? isFollowUpDue(lead.followUpAt) : false;
  const otherEmails = lead ? lead.emailsFound.filter((e) => e && e !== lead.email) : [];

  const frame = embedded
    ? "flex h-full min-h-0 w-full flex-col bg-panel"
    : "absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-line bg-panel shadow-xl";

  return (
    <div className={embedded ? "flex h-full min-h-0 w-full flex-col" : "fixed inset-0 z-40"}>
      {!embedded && (
        <div
          className="absolute inset-0 bg-ink/20 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside className={frame}>
        <div className="flex items-start justify-between gap-3 border-b border-line bg-oat px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold tracking-tight">
              {lead?.name || (loading ? "Loading…" : "Lead")}
            </h2>
            {lead && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <StatusPill status={lead.status} />
                {lead.niche && (
                  <span className="rounded-full bg-accent/25 px-2 py-0.5 font-medium text-ink">
                    {lead.niche}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {location(lead.city, lead.state) || "-"}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && !lead ? (
          <div className="grid flex-1 place-items-center">
            <LoaderCircle className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : !lead ? (
          <div className="p-5 text-sm text-danger">{error || "Lead not found."}</div>
        ) : (
          <>
            {/* Pipeline controls */}
            <div className="space-y-3 border-b border-line px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-xs font-medium text-muted">
                  Status
                  <select
                    value={lead.status}
                    disabled={busy}
                    onChange={(e) => patch({ status: e.target.value })}
                    className="flex-1 rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-fg outline-none focus:border-accent"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => patch({ saved: !lead.saved })}
                  disabled={busy}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    lead.saved
                      ? "bg-ink text-white hover:opacity-90"
                      : "border border-line text-fg hover:border-accent"
                  }`}
                >
                  <Star className={`h-4 w-4 ${lead.saved ? "fill-current" : ""}`} />
                  {lead.saved ? "Saved" : "Save"}
                </button>
                <button
                  onClick={copyDetails}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-fg transition hover:border-accent"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
                <CalendarClock className={`h-4 w-4 ${followUpDue ? "text-danger" : ""}`} />
                <span className={followUpDue ? "text-danger" : ""}>
                  {followUpDue ? "Follow-up due" : "Follow up on"}
                </span>
                <input
                  type="date"
                  value={toDateInput(lead.followUpAt)}
                  disabled={busy}
                  onChange={(e) =>
                    patch({
                      followUpAt: e.target.value
                        ? new Date(`${e.target.value}T09:00:00`).toISOString()
                        : null,
                    })
                  }
                  className="rounded-full border border-line bg-panel px-3 py-1 text-sm text-fg outline-none focus:border-accent"
                />
                {lead.followUpAt && (
                  <button
                    onClick={() => patch({ followUpAt: null })}
                    disabled={busy}
                    className="text-muted underline-offset-2 hover:text-fg hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-4">
              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{error}</div>
                </div>
              )}

              {/* Details */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-fg">Details</h3>
                  {!editing && (
                    <button
                      onClick={() => {
                        setForm(formFromLead(lead));
                        setEditing(true);
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                </div>

                {editing && form ? (
                  <div className="space-y-2.5">
                    {(Object.keys(FIELD_LABELS) as (keyof EditForm)[]).map((field) => (
                      <label key={field} className="block">
                        <span className="text-xs font-medium capitalize text-muted">
                          {FIELD_LABELS[field]}
                        </span>
                        <input
                          value={form[field]}
                          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-line bg-oat px-3 py-1.5 text-sm text-fg outline-none focus:border-accent focus:bg-panel"
                        />
                      </label>
                    ))}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditing(false)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdits}
                        disabled={busy}
                        className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-50"
                      >
                        Save changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-3">
                    <DetailRow icon={<User className="h-4 w-4" />} label="Contact">
                      {lead.contactName || <span className="text-muted">Not set</span>}
                    </DetailRow>
                    <DetailRow icon={<Mail className="h-4 w-4" />} label="Email">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-fg hover:underline">
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-muted">Not available</span>
                      )}
                      {otherEmails.length > 0 && (
                        <span className="mt-0.5 block text-xs text-muted">
                          Also found: {otherEmails.join(", ")}
                        </span>
                      )}
                      {lead.email && mailboxes.length > 0 && !composing && (
                        <button
                          onClick={() => setComposing(true)}
                          className="mt-1.5 text-xs font-semibold text-ink underline-offset-2 hover:underline"
                        >
                          Email this lead
                        </button>
                      )}
                      {lead.email && mailboxes.length === 0 && (
                        <button
                          onClick={() => onOpenMailboxes?.()}
                          className="mt-1.5 block text-xs font-medium text-muted underline-offset-2 hover:underline"
                        >
                          Connect a mailbox to email this lead
                        </button>
                      )}
                      {composing && lead.email && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            sendLeadMail();
                          }}
                          className="mt-2 space-y-2"
                        >
                          <label className="block">
                            <span className="text-xs font-medium text-muted">From</span>
                            <select
                              value={mailAccountId}
                              onChange={(e) => setMailAccountId(Number(e.target.value))}
                              className="mt-1 w-full rounded-lg border border-line bg-oat px-2 py-1.5 text-sm outline-none focus:border-accent"
                            >
                              {mailboxes.map((mailbox) => (
                                <option key={mailbox.id} value={mailbox.id}>
                                  {mailbox.address}
                                </option>
                              ))}
                            </select>
                          </label>
                          {templates.length > 0 && (
                            <label className="block">
                              <span className="text-xs font-medium text-muted">Use template</span>
                              <select
                                value=""
                                onChange={(e) => {
                                  const template = templates.find((t) => t.id === Number(e.target.value));
                                  if (!template) return;
                                  const rendered = renderTemplate(template, lead);
                                  setMailSubject(rendered.subject);
                                  setMailBody(rendered.body);
                                  setTemplateNote(
                                    rendered.missing.length
                                      ? `This lead has no value for ${rendered.missing.map((f) => `{{${f}}}`).join(", ")}. Fill the gaps before sending.`
                                      : null
                                  );
                                }}
                                className="mt-1 w-full rounded-lg border border-line bg-oat px-2 py-1.5 text-sm outline-none focus:border-accent"
                              >
                                <option value="">Choose a template…</option>
                                {templates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                              {templateNote && <span className="mt-1 block text-xs text-danger">{templateNote}</span>}
                            </label>
                          )}
                          <label className="block">
                            <span className="text-xs font-medium text-muted">Subject</span>
                            <input
                              value={mailSubject}
                              onChange={(e) => setMailSubject(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-line bg-oat px-2 py-1.5 text-sm outline-none focus:border-accent"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-muted">Message</span>
                            <textarea
                              value={mailBody}
                              onChange={(e) => setMailBody(e.target.value)}
                              rows={4}
                              className="mt-1 w-full resize-none rounded-lg border border-line bg-oat px-2 py-1.5 text-sm outline-none focus:border-accent"
                            />
                          </label>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setComposing(false)}
                              className="rounded-full px-3 py-1 text-xs font-medium text-muted"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={busy}
                              className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-ink disabled:opacity-50"
                            >
                              {busy ? "Sending…" : "Send"}
                            </button>
                          </div>
                        </form>
                      )}
                    </DetailRow>
                    <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="text-fg hover:underline">
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-muted">Not available</span>
                      )}
                    </DetailRow>
                    <DetailRow icon={<Globe className="h-4 w-4" />} label="Website">
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-fg hover:underline"
                        >
                          {lead.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        <span className="text-muted">Not available</span>
                      )}
                    </DetailRow>
                    <DetailRow icon={<MapPin className="h-4 w-4" />} label="Address">
                      {lead.address || location(lead.city, lead.state) || (
                        <span className="text-muted">Not available</span>
                      )}
                    </DetailRow>
                    {aiEnabled && (
                      <DetailRow icon={<Sparkles className="h-4 w-4" />} label="AI research">
                        <AiResearchBlock
                          lead={lead}
                          onLeadChange={(next) => {
                            setLead(next);
                            onLeadChange(next);
                          }}
                        />
                      </DetailRow>
                    )}
                    <DetailRow icon={<Users className="h-4 w-4" />} label="Decision makers">
                      <DecisionMakerBlock lead={lead} />
                      {!lead.decisionMakers?.length && (
                        <button
                          onClick={findDecisionMakers}
                          disabled={dmLoading}
                          className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-fg underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          {dmLoading ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Search className="h-3.5 w-3.5" />
                          )}
                          {dmLoading ? "Searching LinkedIn…" : "Find decision makers"}
                        </button>
                      )}
                    </DetailRow>
                  </dl>
                )}
              </section>

              {/* Notes */}
              <section>
                <h3 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-fg">
                  <StickyNote className="h-4 w-4 text-muted" />
                  Notes
                </h3>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote();
                  }}
                  placeholder="Add a note: call outcome, who you spoke to, next steps…"
                  rows={3}
                  className="w-full resize-y rounded-xl border border-line bg-oat px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:bg-panel"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={submitNote}
                    disabled={busy || !noteDraft.trim()}
                    className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Add note
                  </button>
                </div>
                {notes.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {notes.map((n) => (
                      <li key={n.id} className="group rounded-xl border border-line bg-panel p-3">
                        <p className="whitespace-pre-wrap break-words text-sm text-fg">{n.body}</p>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                          <span>{formatDateTime(n.createdAt)}</span>
                          <button
                            onClick={() => removeNote(n.id)}
                            className="opacity-0 transition hover:text-danger group-hover:opacity-100"
                            aria-label="Delete note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Activity */}
              <section>
                <h3 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-fg">
                  <History className="h-4 w-4 text-muted" />
                  Activity
                </h3>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted">No activity yet.</p>
                ) : (
                  <ol className="relative space-y-3 border-l border-line pl-4">
                    {activities.map((a) => (
                      <li key={a.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-accent" />
                        <p className="text-sm text-fg">{describeActivity(a)}</p>
                        <p className="text-[11px] text-muted">{formatDateTime(a.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>

            <div className="flex items-center gap-2 border-t border-line px-5 py-3">
              <div className="ml-auto flex items-center gap-2">
                {confirmDelete ? (
                  <>
                    <span className="text-xs text-muted">Delete this lead?</span>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={remove}
                      disabled={busy}
                      className="rounded-full bg-danger px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted transition hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function DecisionMakerBlock({ lead }: { lead: CrmLead }) {
  const matches = lead.decisionMakers || [];
  if (matches.length > 0) {
    return (
      <ul className="space-y-2">
        {matches.map((dm) => (
          <li key={dm.url} className="flex items-start gap-2">
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#0a66c2]" />
            <div className="min-w-0">
              <p className="font-medium text-fg">{dm.name}</p>
              {dm.title && <p className="text-xs text-muted">{dm.title}</p>}
              <a
                href={dm.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-xs text-fg hover:underline"
              >
                {dm.url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
              <p className="text-[11px] text-muted">
                {Math.round(dm.confidence * 100)}% confidence
              </p>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  // No SerpApi match, but the lead's own website linked a LinkedIn profile.
  if (lead.websiteLinkedIn) {
    return (
      <div className="flex items-start gap-2">
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#0a66c2]" />
        <a
          href={lead.websiteLinkedIn}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-fg hover:underline"
        >
          {lead.websiteLinkedIn.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      </div>
    );
  }

  if (lead.decisionMakerStatus === "none" || lead.decisionMakerStatus === "error") {
    return <span className="text-muted">No reliable match found.</span>;
  }

  return <span className="text-muted">Not looked up yet.</span>;
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-oat text-muted">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-fg">{children}</dd>
      </div>
    </div>
  );
}
