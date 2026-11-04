"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { MERGE_FIELDS, MERGE_FIELD_LABELS } from "@/lib/mail/merge";
import { deleteTemplate, fetchOfferProfile, fetchTemplates, saveTemplate, type AiAccess } from "./crmApi";
import type { EmailTemplate } from "./types";

const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-oat px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:bg-panel";

const STARTER = {
  name: "",
  subject: "Quick question about {{name}}",
  body: "Hi {{contactName|there}},\n\n",
};

// Premium starter leads with the AI opener; its fallback keeps it sendable without AI research.
const AI_STARTER_BODY = "Hi {{contactName|there}},\n\n{{aiOpener|I came across your business and had a quick idea.}}\n\n";

type Draft = { id: number | null; name: string; subject: string; body: string };

export function TemplatesManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aiAccess, setAiAccess] = useState<AiAccess>("premium_required");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<"subject" | "body">("body");

  useEffect(() => {
    fetchOfferProfile()
      .then((json) => setAiAccess(json.ai))
      .catch(() => {});
    fetchTemplates()
      .then((json) => setTemplates(json.templates))
      .catch((err) => setError((err as Error).message));
  }, []);

  const insertField = (field: string) => {
    if (!draft) return;
    const token = `{{${field}}}`;
    if (lastFocus.current === "subject") {
      setDraft({ ...draft, subject: `${draft.subject}${token}` });
      return;
    }
    const el = bodyRef.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    setDraft({ ...draft, body: draft.body.slice(0, start) + token + draft.body.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const { template } = await saveTemplate(draft.id, draft);
      setTemplates((prev) => [template, ...prev.filter((t) => t.id !== template.id)]);
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTemplate(draft.id);
      setTemplates((prev) => prev.filter((t) => t.id !== draft.id));
      setDraft(null);
      setConfirmDelete(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Email templates</h2>
          <p className="mt-0.5 text-xs text-muted">
            Use merge fields like {"{{name}}"}. Add a fallback with {"{{contactName|there}}"}; a lead missing a field
            with no fallback is skipped in bulk sends.
          </p>
        </div>
        {!draft && (
          <button
            onClick={() => {
              setDraft({ id: null, ...STARTER, body: aiAccess === "premium_required" ? STARTER.body : AI_STARTER_BODY });
              setConfirmDelete(false);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            New template
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="max-w-2xl space-y-3 rounded-xl border border-line bg-panel px-4 py-4"
        >
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted">Name</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Dentists, first touch"
              required
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted">Subject</span>
            <input
              value={draft.subject}
              onFocus={() => (lastFocus.current = "subject")}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              required
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted">Body</span>
            <textarea
              ref={bodyRef}
              value={draft.body}
              onFocus={() => (lastFocus.current = "body")}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={10}
              required
              className={`${fieldClass} resize-y font-mono text-[13px]`}
            />
          </label>
          <div>
            <span className="text-xs font-medium text-muted">Insert field</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MERGE_FIELDS.filter((field) => aiAccess !== "premium_required" || !field.startsWith("ai")).map((field) => (
                <button
                  key={field}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertField(field)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    field.startsWith("ai") ? "border-accent/60 bg-accent/10 text-ink" : "border-line bg-oat text-fg"
                  } hover:border-accent`}
                >
                  {MERGE_FIELD_LABELS[field]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {aiAccess === "premium_required"
                ? "AI personalisation is a premium feature."
                : aiAccess === "not_configured"
                  ? "AI fields will fill once AI research is set up. Until then, leads using them are skipped unless the field has a fallback."
                  : "AI fields come from AI research on each lead and only fill when the research is confident."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {draft.id &&
              (confirmDelete ? (
                <>
                  <span className="text-xs text-muted">Delete this template?</span>
                  <button type="button" onClick={remove} disabled={busy} className="text-xs font-semibold text-danger">
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-muted">
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs font-medium text-danger">
                  Delete
                </button>
              ))}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        </form>
      ) : templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          No templates yet. Create one to email many leads at once from the CRM.
        </p>
      ) : (
        <ul className="max-w-2xl divide-y divide-line rounded-xl border border-line">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  setDraft({ id: t.id, name: t.name, subject: t.subject, body: t.body });
                  setConfirmDelete(false);
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-oat"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{t.name}</span>
                  <span className="block truncate text-xs text-muted">{t.subject}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
