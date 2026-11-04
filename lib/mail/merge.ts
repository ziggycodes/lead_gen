// Merge fields for email templates: {{field}} or {{field|fallback}}.
// A field that renders empty with no fallback is reported as missing so the
// caller can skip that lead instead of sending "Hi ,".

export const MERGE_FIELDS = [
  "name",
  "contactName",
  "city",
  "state",
  "niche",
  "website",
  "phone",
  "aiOpener",
  "aiPainPoint",
  "aiPitch",
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number];

export const MERGE_FIELD_LABELS: Record<MergeField, string> = {
  name: "Business name",
  contactName: "Contact name",
  city: "City",
  state: "State",
  niche: "Niche",
  website: "Website",
  phone: "Phone",
  aiOpener: "AI opener",
  aiPainPoint: "AI pain point",
  aiPitch: "AI pitch",
};

export interface MergeLead {
  name?: string | null;
  contactName?: string | null;
  city?: string | null;
  state?: string | null;
  niche?: string | null;
  website?: string | null;
  phone?: string | null;
  // jsonb column; read defensively.
  insight?: unknown;
  insightStatus?: string | null;
}

function insightText(insight: unknown, key: "opener" | "painPoint" | "pitch"): string {
  if (!insight || typeof insight !== "object") return "";
  const value = (insight as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

const TOKEN = /\{\{\s*([a-zA-Z]+)\s*(?:\|([^}]*))?\}\}/g;

function isMergeField(v: string): v is MergeField {
  return (MERGE_FIELDS as readonly string[]).includes(v);
}

export function mergeValues(lead: MergeLead): Record<MergeField, string> {
  // Only reviewed-quality drafts are used; low-confidence ones stay out of emails.
  const ai = lead.insightStatus === "ready" ? lead.insight : null;
  return {
    name: lead.name ?? "",
    contactName: lead.contactName ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    niche: lead.niche ?? "",
    website: lead.website ?? "",
    phone: lead.phone ?? "",
    aiOpener: insightText(ai, "opener"),
    aiPainPoint: insightText(ai, "painPoint"),
    aiPitch: insightText(ai, "pitch"),
  };
}

function renderText(text: string, values: Record<MergeField, string>, missing: Set<string>): string {
  return text.replace(TOKEN, (_match, rawField: string, fallback: string | undefined) => {
    if (!isMergeField(rawField)) {
      missing.add(rawField);
      return "";
    }
    const value = values[rawField].trim();
    if (value) return value;
    if (fallback !== undefined) return fallback.trim();
    missing.add(rawField);
    return "";
  });
}

export function renderTemplate(template: { subject: string; body: string }, lead: MergeLead) {
  const values = mergeValues(lead);
  const missing = new Set<string>();
  const subject = renderText(template.subject, values, missing);
  // Drop blank lines left by empty fallbacks, e.g. "{{aiPitch|}}" on its own line.
  const body = renderText(template.body, values, missing).replace(/\n{3,}/g, "\n\n");
  return { subject: subject.trim(), body: body.trim(), missing: [...missing] };
}

// Fields a template uses, for the "needs AI research" hint in the UI.
export function templateFields(template: { subject: string; body: string }): string[] {
  const found = new Set<string>();
  for (const text of [template.subject, template.body]) {
    for (const m of text.matchAll(TOKEN)) found.add(m[1]);
  }
  return [...found];
}
