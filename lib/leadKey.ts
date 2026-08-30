// Stable dedup key for a lead, shared by the client (to know which leads are
// already saved) and the server (to enforce the unique index). Prefers the OSM
// link since it uniquely identifies a place; falls back to name+city+state.
export interface LeadLike {
  name?: string;
  city?: string;
  state?: string;
  osmLink?: string;
}

export function leadKey(lead: LeadLike): string {
  if (lead.osmLink && lead.osmLink.trim()) return lead.osmLink.trim();
  return [lead.name, lead.city, lead.state]
    .map((s) => (s || "").trim().toLowerCase())
    .join("|");
}
