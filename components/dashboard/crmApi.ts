import type { CrmLead, LeadActivity, LeadNote } from "./types";

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

export async function exportLeads(format: "csv" | "xlsx", ids?: number[]) {
  const res = await fetch("/api/leads/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { format, ids } : { format }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = match?.[1] || `leads.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
