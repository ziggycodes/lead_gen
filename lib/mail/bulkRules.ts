// Who a bulk send skips and why. Pure so the send sheet can preview it in the
// browser with the same rules the server applies.
import { renderTemplate, type MergeLead } from "./merge.ts";
import { isEmailAddress, normalizeEmail } from "./text.ts";

// Leads in these stages are past cold outreach.
export const BULK_SKIP_STATUSES = new Set(["won", "lost", "not_interested"]);

export const UNSUBSCRIBED_LABEL = "Unsubscribed";
export const MAX_SEND_ATTEMPTS = 3;

// Wait after a temporary failure: 5 minutes, then 15, then give up.
export function retryDelaySeconds(attempts: number) {
  return attempts <= 1 ? 300 : 900;
}

export function statusSkipLabel(status: string) {
  return `Lead is ${status.replace("_", " ")}`;
}

export function missingLabel(missing: string[]) {
  return `Missing ${missing.map((f) => `{{${f}}}`).join(", ")}`;
}

export function skipReason(
  lead: MergeLead & { email?: string | null; status: string },
  template: { subject: string; body: string },
  seen: Set<string>,
  suppressed: Set<string>
): string | null {
  const email = normalizeEmail(lead.email);
  if (!isEmailAddress(email)) return "No email address";
  if (seen.has(email)) return "Duplicate address in this batch";
  if (suppressed.has(email)) return UNSUBSCRIBED_LABEL;
  if (BULK_SKIP_STATUSES.has(lead.status)) return statusSkipLabel(lead.status);
  const { missing } = renderTemplate(template, lead);
  if (missing.length) return missingLabel(missing);
  return null;
}

// Splits leads into sendable and skipped, marking each sendable address as seen.
export function planRecipients<T extends MergeLead & { email?: string | null; status: string }>(
  leads: T[],
  template: { subject: string; body: string },
  suppressed: Set<string> = new Set()
) {
  const seen = new Set<string>();
  const send: T[] = [];
  const skip: { lead: T; reason: string }[] = [];
  for (const lead of leads) {
    const reason = skipReason(lead, template, seen, suppressed);
    if (reason) skip.push({ lead, reason });
    else {
      seen.add(normalizeEmail(lead.email));
      send.push(lead);
    }
  }
  return { send, skip };
}
