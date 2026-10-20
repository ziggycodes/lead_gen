import type { LeadStatus } from "@/lib/crm";
import type { CrmLead } from "./types";
import { isFollowUpDue } from "./format";

export interface LeadFilters {
  query: string;
  status: LeadStatus | "all";
  niche: string;
  state: string;
  source: number | null;
  hasEmail: boolean;
  hasPhone: boolean;
  savedOnly: boolean;
  followUpDue: boolean;
}

export const EMPTY_FILTERS: LeadFilters = {
  query: "",
  status: "all",
  niche: "",
  state: "",
  source: null,
  hasEmail: false,
  hasPhone: false,
  savedOnly: false,
  followUpDue: false,
};

export function filtersActive(filters: LeadFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.status !== "all" ||
    filters.niche !== "" ||
    filters.state !== "" ||
    filters.source !== null ||
    filters.hasEmail ||
    filters.hasPhone ||
    filters.savedOnly ||
    filters.followUpDue
  );
}

export function filterLeads(leads: CrmLead[], filters: LeadFilters): CrmLead[] {
  const q = filters.query.trim().toLowerCase();
  return leads.filter((l) => {
    if (filters.status !== "all" && l.status !== filters.status) return false;
    if (filters.niche && l.niche !== filters.niche) return false;
    if (filters.state && l.state !== filters.state) return false;
    if (filters.source !== null && l.sourceSearchId !== filters.source) return false;
    if (filters.hasEmail && !l.email) return false;
    if (filters.hasPhone && !l.phone) return false;
    if (filters.savedOnly && !l.saved) return false;
    if (filters.followUpDue && !isFollowUpDue(l.followUpAt)) return false;
    if (q) {
      const hay = [l.name, l.contactName, l.email, l.phone, l.city, l.state, l.niche, l.decisionMakers?.[0]?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
