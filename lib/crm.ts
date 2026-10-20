// Pipeline stages shared by the API (validation) and the dashboard (labels/colors).
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "replied",
  "qualified",
  "won",
  "lost",
  "not_interested",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
  not_interested: "Not interested",
};

export const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-oat text-fg",
  contacted: "bg-accent/35 text-ink",
  replied: "bg-ink/10 text-ink",
  qualified: "bg-accent/15 text-ink",
  won: "bg-ink text-white",
  lost: "bg-danger/10 text-danger",
  not_interested: "bg-ink/5 text-muted",
};

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

// Fields a user may edit by hand from the lead drawer.
export const EDITABLE_LEAD_FIELDS = [
  "name",
  "contactName",
  "email",
  "phone",
  "website",
  "address",
  "city",
  "state",
] as const;

export type EditableLeadField = (typeof EDITABLE_LEAD_FIELDS)[number];
