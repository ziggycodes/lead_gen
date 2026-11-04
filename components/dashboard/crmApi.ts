import type { BulkSend, CrmLead, EmailTemplate, LeadActivity, LeadNote } from "./types";

export interface LeadDetail {
  lead: CrmLead;
  notes: LeadNote[];
  activities: LeadActivity[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export function fetchLeads() {
  return request<{ leads: CrmLead[]; truncated: boolean }>("/api/leads");
}

export function importLeads(leads: unknown[], searchId?: number | null) {
  return request<{
    inserted: number;
    updated: number;
    ids: Record<string, number>;
  }>("/api/leads", {
    method: "POST",
    body: JSON.stringify({
      leads,
      ...(searchId ? { searchId } : {}),
    }),
  });
}

export function bulkUpdateLeads(ids: number[], body: { status?: string; saved?: boolean }) {
  return request<{ leads: CrmLead[] }>("/api/leads", {
    method: "PATCH",
    body: JSON.stringify({ ids, ...body }),
  });
}

export function bulkDeleteLeads(ids: number[]) {
  return request<{ deleted: number[] }>("/api/leads", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export function fetchLeadDetail(id: number) {
  return request<LeadDetail>(`/api/leads/${id}`);
}

export function updateLead(
  id: number,
  body: {
    fields?: Partial<Record<string, string>>;
    status?: string;
    saved?: boolean;
    followUpAt?: string | null;
  }
) {
  return request<LeadDetail>(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteLead(id: number) {
  return request<{ deleted: number }>(`/api/leads/${id}`, { method: "DELETE" });
}

export function addNote(id: number, body: string) {
  return request<{ note: LeadNote }>(`/api/leads/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteNote(id: number, noteId: number) {
  return request<{ deleted: number }>(`/api/leads/${id}/notes?noteId=${noteId}`, {
    method: "DELETE",
  });
}

export function lookupDecisionMakers(id: number) {
  return request<{ lead: CrmLead }>(`/api/leads/${id}/decision-makers`, { method: "POST" });
}

export function fetchTemplates() {
  return request<{ templates: EmailTemplate[] }>("/api/email-templates");
}

export function saveTemplate(id: number | null, body: { name: string; subject: string; body: string }) {
  return request<{ template: EmailTemplate }>(id ? `/api/email-templates/${id}` : "/api/email-templates", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function deleteTemplate(id: number) {
  return request<{ deleted: number }>(`/api/email-templates/${id}`, { method: "DELETE" });
}

export function startBulkSend(body: { accountId: number; templateId: number; leadIds: number[] }) {
  return request<{ send: BulkSend }>("/api/email/bulk", { method: "POST", body: JSON.stringify(body) });
}

export function fetchBulkSends() {
  return request<{ sends: BulkSend[] }>("/api/email/bulk");
}

export function cancelBulkSend(id: number) {
  return request<{ send: BulkSend }>(`/api/email/bulk/${id}`, { method: "DELETE" });
}

export type Mailbox = {
  id: number;
  address: string;
  isDefault: boolean;
  status: string;
  provider: string;
  smtpHost: string;
  timezone: string;
  createdAt: string;
  warmup: { day: number; cap: number; sentToday: number; remainingToday: number; warmed: boolean };
};

export async function fetchConnectedMailboxes(): Promise<Mailbox[]> {
  const { mailboxes } = await request<{ mailboxes: Mailbox[] }>("/api/email-accounts");
  return (mailboxes || []).filter((m) => m.status === "connected");
}

export type OfferProfile = { offer: string; audience: string; proof: string; tone: string };

// Mirrors AiAccess in lib/insights.ts.
export type AiAccess = "available" | "not_configured" | "premium_required";

export function fetchOfferProfile() {
  return request<{ ai: AiAccess; offer: OfferProfile | null }>("/api/offer-profile");
}

export function saveOfferProfile(body: OfferProfile) {
  return request<{ offer: OfferProfile }>("/api/offer-profile", { method: "PUT", body: JSON.stringify(body) });
}

export function researchLeads(leadIds: number[]) {
  return request<{ queued: number[] }>("/api/insights", { method: "POST", body: JSON.stringify({ leadIds }) });
}

export function researchLead(id: number) {
  return request<{ lead: CrmLead }>(`/api/leads/${id}/insight`, { method: "POST" });
}

export function saveInsight(id: number, body: { opener: string; painPoint: string; pitch: string }) {
  return request<{ lead: CrmLead }>(`/api/leads/${id}/insight`, { method: "PATCH", body: JSON.stringify(body) });
}
