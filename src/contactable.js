// A lead is contactable only when it has a phone number or an email.
// Used by the search pipeline, API routes, and CLI so none of those surfaces
// keep businesses the user cannot actually reach.

export function isContactable(lead) {
  if (!lead || typeof lead !== "object") return false;
  const phone = typeof lead.phone === "string" ? lead.phone.trim() : "";
  const email = typeof lead.email === "string" ? lead.email.trim() : "";
  return Boolean(phone || email);
}

export function filterContactable(leads) {
  if (!Array.isArray(leads)) return [];
  return leads.filter(isContactable);
}
