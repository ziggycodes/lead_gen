// Pricing for the Nigerian market. Amounts are in kobo (1 NGN = 100 kobo).
// All tiers use the free Basic engine (OSM + heuristic pain points), so leads
// cost ~nothing to serve. LLM/SerpApi enrichment stays off for web users.

export const FREE_TRIAL_LEADS = 50;
export const DAILY_LEAD_CAP = 50;

export interface CreditPack {
  id: string;
  name: string;
  amountKobo: number;
  credits: number;
  blurb: string;
}

export const CREDIT_PACKS: Record<string, CreditPack> = {
  starter: {
    id: "starter",
    name: "Starter Pack",
    amountKobo: 500_00,
    credits: 150,
    blurb: "150 leads - perfect for testing a niche",
  },
  standard: {
    id: "standard",
    name: "Standard Pack",
    amountKobo: 1500_00,
    credits: 500,
    blurb: "500 leads - a full campaign's worth",
  },
  pro: {
    id: "pro",
    name: "Pro Pack",
    amountKobo: 3000_00,
    credits: 1200,
    blurb: "1,200 leads - best value per lead",
  },
};

export function formatNaira(kobo: number): string {
  return "\u20a6" + (kobo / 100).toLocaleString("en-NG");
}
