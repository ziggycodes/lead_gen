"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { researchLead, saveInsight } from "./crmApi";
import type { CrmLead } from "./types";

const fieldClass =
  "mt-1 w-full resize-y rounded-lg border border-line bg-oat px-2 py-1.5 text-sm outline-none focus:border-accent";

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  ready: { label: "Ready for emails", tone: "bg-accent/20 text-ink" },
  low_confidence: { label: "Needs review", tone: "bg-ink/10 text-ink" },
  failed: { label: "Failed", tone: "bg-danger/10 text-danger" },
  no_site: { label: "No usable website", tone: "bg-ink/5 text-muted" },
  pending: { label: "Researching…", tone: "bg-ink/5 text-muted" },
};

// AI draft for one lead: generate, review, edit. Saving an edit marks it ready,
// which lets {{aiOpener}} etc. fill in bulk sends.
export function AiResearchBlock({ lead, onLeadChange }: { lead: CrmLead; onLeadChange: (lead: CrmLead) => void }) {
  const [draft, setDraft] = useState({ opener: "", painPoint: "", pitch: "" });
  const [busy, setBusy] = useState<"research" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      opener: lead.insight?.opener ?? "",
      painPoint: lead.insight?.painPoint ?? "",
      pitch: lead.insight?.pitch ?? "",
    });
    setError(null);
  }, [lead.id, lead.insight]);

  const run = async (kind: "research" | "save", fn: () => Promise<{ lead: CrmLead }>) => {
    setBusy(kind);
    setError(null);
    try {
      onLeadChange((await fn()).lead);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const insight = lead.insight;
  const status = lead.insightStatus ? STATUS_COPY[lead.insightStatus] : null;
  const dirty =
    draft.opener !== (insight?.opener ?? "") ||
    draft.painPoint !== (insight?.painPoint ?? "") ||
    draft.pitch !== (insight?.pitch ?? "");
  const canApprove = lead.insightStatus === "low_confidence" && !dirty;
  const hasDraft = Boolean(insight && (insight.opener || insight.painPoint || insight.pitch));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>}
        {insight?.confidence && hasDraft && <span className="text-xs text-muted">Confidence: {insight.confidence}</span>}
        <button
          onClick={() => run("research", () => researchLead(lead.id))}
          disabled={busy !== null || lead.insightStatus === "pending" || !lead.website}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-medium hover:border-accent disabled:opacity-50"
        >
          {busy === "research" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy === "research" ? "Reading their site…" : lead.insightStatus ? "Research again" : "Research with AI"}
        </button>
      </div>

      {!lead.website && <p className="text-xs text-muted">Add a website to this lead to research it.</p>}
      {insight?.error && <p className="text-xs text-danger">{insight.error}</p>}
      {lead.insightStatus === "low_confidence" && (
        <p className="text-xs text-muted">
          The site didn&apos;t give enough to personalise confidently, so these lines won&apos;t be used in bulk sends
          until you edit or approve them.
        </p>
      )}
      {insight?.summary && <p className="text-sm text-fg">{insight.summary}</p>}

      {(hasDraft || lead.insightStatus === "low_confidence") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("save", () => saveInsight(lead.id, draft));
          }}
          className="space-y-2"
        >
          {(
            [
              ["opener", "Opener · {{aiOpener}}"],
              ["painPoint", "Pain point · {{aiPainPoint}}"],
              ["pitch", "Pitch · {{aiPitch}}"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-muted">{label}</span>
              <textarea
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                rows={2}
                className={fieldClass}
              />
            </label>
          ))}
          {insight?.evidence?.length ? (
            <div className="text-xs text-muted">
              <span className="font-medium">From their site:</span>
              <ul className="mt-1 space-y-0.5">
                {insight.evidence.map((quote) => (
                  <li key={quote}>&ldquo;{quote}&rdquo;</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-xs text-danger">{error}</span>}
            {(dirty || canApprove) && (
              <button
                type="submit"
                disabled={busy !== null}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-ink disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : dirty ? "Save edits" : "Approve for emails"}
              </button>
            )}
          </div>
        </form>
      )}
      {!hasDraft && error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
