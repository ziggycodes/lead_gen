// A contact email counts once per lead that has an address. Phone-only leads
// do not use the daily allowance. `budget` null means unlimited.

export function leadHasEmail(lead) {
  if (!lead || typeof lead !== "object") return false;
  const email = lead.email;
  return typeof email === "string" && email.trim().length > 0;
}

export function countEmailLeads(leads) {
  if (!Array.isArray(leads)) return 0;
  let n = 0;
  for (const lead of leads) if (leadHasEmail(lead)) n += 1;
  return n;
}

// Drop email leads once `alreadyKept` email leads plus this batch reach `budget`.
// Phone-only leads in the batch are kept. Returns whether any email lead was dropped.
export function admitWithinEmailCap(leads, budget, alreadyKept = 0) {
  const incoming = Array.isArray(leads) ? leads : [];
  const keep = [];
  let emails = Number.isFinite(alreadyKept) ? alreadyKept : 0;
  let capped = false;
  for (const lead of incoming) {
    if (leadHasEmail(lead)) {
      if (budget !== null && emails >= budget) {
        capped = true;
        continue;
      }
      emails += 1;
    }
    keep.push(lead);
  }
  return { keep, emails, capped };
}
