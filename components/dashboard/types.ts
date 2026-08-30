export interface Lead {
  name: string;
  niche: string;
  state: string;
  city: string;
  phone: string;
  website: string;
  email: string;
  address: string;
  painPoint: string;
  pitchAngle: string;
  signals: string;
  osmLink: string;
}

export interface SearchHistoryItem {
  id: number;
  status: string;
  params: { niches?: string; states?: string; limit?: number } | null;
  leadCount: number;
  createdAt: string;
  completedAt: string | null;
}

// Shared chart palette — warm Clay-adjacent accents first.
export const CHART_COLORS = [
  "#c8f031", // accent lime
  "#ff8a65", // coral
  "#e8b94a", // ochre
  "#7cb342", // mint
  "#141414", // ink
  "#6b6560", // muted
  "#e8e4db", // oat
];
