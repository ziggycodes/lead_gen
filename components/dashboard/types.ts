export interface DecisionMaker {
  name: string;
  title: string;
  url: string;
  confidence: number;
  source: string;
}

export interface Lead {
  name: string;
  niche: string;
  state: string;
  city: string;
  phone: string;
  website: string;
  email: string;
  emailSource?: string;
  emailsFound?: string[];
  websiteLinkedIn?: string;
  address: string;
  osmLink: string;
  decisionMakers?: DecisionMaker[];
  decisionMakerStatus?: "found" | "none" | "error";
  _crmId?: number;
}

// Mirrors `CrmLead` from lib/leads.ts (the JSON shape served by /api/leads).
export interface CrmLead {
  id: number;
  leadKey: string;
  status: string;
  saved: boolean;
  name: string;
  niche: string;
  nicheKey: string;
  state: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  contactName: string;
  osmLink: string;
  decisionMakers: DecisionMaker[] | null;
  decisionMakerStatus: "found" | "none" | "error" | null;
  websiteLinkedIn: string;
  emailsFound: string[];
  sourceSearchId: number | null;
  followUpAt: string | null;
  lastActivityAt: string;
  createdAt: string;
}

export interface LeadNote {
  id: number;
  body: string;
  createdAt: string;
}

export interface LeadActivity {
  id: number;
  type: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface Usage {
  unlimited: boolean;
  consumedToday: number;
  totalConsumed: number;
}

export interface SearchHistoryItem {
  id: number;
  status: string;
  params: { niches?: string; states?: string; limit?: number } | null;
  leadCount: number;
  createdAt: string;
  completedAt: string | null;
}

// Shared chart palette — ink, map-gold, and manila paper.
export const CHART_COLORS = [
  "#c9a227", // ochre
  "#1c1914", // ink
  "#8a7340", // deep gold
  "#efe6d2", // paper
  "#6f6758", // muted
  "#ddd4c0", // line
  "#fffbf2", // panel
];
