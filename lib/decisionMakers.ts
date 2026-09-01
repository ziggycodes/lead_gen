// On-demand decision-maker lookup. Finds publicly indexed LinkedIn profile
// URLs for a business by querying Google through SerpApi (engine=google,
// scoped to site:linkedin.com/in). This never touches LinkedIn's own API and
// only surfaces links Google has already indexed. Coverage is partial: best
// for businesses with a website and a named public owner. When nothing
// crosses the confidence floor we return an empty list so the UI can say
// "no reliable match found" rather than guess.

export interface DecisionMaker {
  name: string;
  title: string;
  url: string;
  confidence: number;
  source: string;
}

export interface DecisionMakerInput {
  name?: string;
  city?: string;
  state?: string;
  website?: string;
}

const SOURCE = "serpapi/google";

// Minimum score (0-1) a candidate must reach to be surfaced at all.
const CONFIDENCE_FLOOR = 0.4;
const MAX_MATCHES = 3;

// Senior roles worth pitching. Used both to bias the query and to score
// candidate titles. Keep lowercase.
const SENIOR_TITLES = [
  "owner",
  "co-owner",
  "founder",
  "co-founder",
  "ceo",
  "chief executive",
  "president",
  "principal",
  "partner",
  "managing director",
  "director",
  "practice owner",
  "practice manager",
  "office manager",
  "general manager",
  "proprietor",
  "md",
];

export function hasDecisionMakerLookup(): boolean {
  return Boolean(process.env.SERPAPI_KEY?.trim());
}

// Extract a bare registrable-ish domain from a website URL: strips protocol,
// www, path, and query. Returns "" when nothing usable is present.
export function extractDomain(website?: string): string {
  if (!website) return "";
  let raw = website.trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalize(text: string): string {
  return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Tokens from a business name that carry identity, dropping generic filler so
// "Smith Family Dental LLC" still matches "Smith Family Dentistry".
function nameTokens(name: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "llc",
    "inc",
    "co",
    "corp",
    "ltd",
    "of",
    "for",
    "a",
  ]);
  return normalize(name)
    .split(" ")
    .filter((t) => t.length > 2 && !stop.has(t));
}

// Only genuine member profiles. Reject company pages, directory/pub pages,
// posts, and anything off linkedin.com.
export function isProfileUrl(url: string): boolean {
  if (!url) return false;
  let host: string;
  let path: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return false;
  }
  if (!/(^|\.)linkedin\.com$/.test(host)) return false;
  return /^\/in\/[^/]+\/?$/.test(path);
}

// LinkedIn result titles usually look like:
//   "Jane Smith - Owner - Smith Family Dental | LinkedIn"
//   "Jane Smith - Smith Family Dental - Owner - LinkedIn"
// Parse a best-effort { name, title } out of that.
export function parseTitle(rawTitle: string): { name: string; title: string } {
  const cleaned = (rawTitle || "")
    .replace(/\s*[|\u2013\u2014-]\s*LinkedIn\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned
    .split(/\s+[|\u2013\u2014-]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { name: "", title: "" };

  const name = parts[0];
  let title = "";
  for (let i = 1; i < parts.length; i++) {
    const lower = parts[i].toLowerCase();
    if (SENIOR_TITLES.some((t) => lower.includes(t))) {
      title = parts[i];
      break;
    }
  }
  if (!title && parts.length > 1) title = parts[1];
  return { name, title };
}

function titleScore(title: string): number {
  const lower = (title || "").toLowerCase();
  return SENIOR_TITLES.some((t) => lower.includes(t)) ? 1 : 0;
}

// How much of the business identity appears in the result text.
function businessScore(haystack: string, tokens: string[], domain: string): number {
  const hay = normalize(haystack);
  if (domain) {
    const brand = domain.split(".")[0];
    if (brand && brand.length > 2 && hay.includes(normalize(brand))) return 1;
  }
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length;
}

function locationScore(haystack: string, city: string, state: string): number {
  const hay = normalize(haystack);
  const c = normalize(city);
  const s = normalize(state);
  if (c && hay.includes(c)) return 1;
  if (s && hay.includes(s)) return 1;
  return 0;
}

interface SerpResult {
  title?: string;
  link?: string;
  snippet?: string;
}

// Weighted blend of the individual signals into a 0-1 confidence.
function scoreCandidate(
  result: SerpResult,
  lead: DecisionMakerInput,
  tokens: string[],
  domain: string
): DecisionMaker | null {
  const url = result.link || "";
  if (!isProfileUrl(url)) return null;

  const haystack = `${result.title || ""} ${result.snippet || ""}`;
  const biz = businessScore(haystack, tokens, domain);
  const loc = locationScore(haystack, lead.city || "", lead.state || "");
  const { name, title } = parseTitle(result.title || "");
  const seniority = titleScore(title);

  // Business identity is the dominant signal; a senior title and location
  // matching add confidence but can't carry a match on their own.
  const confidence = Number((biz * 0.6 + seniority * 0.25 + loc * 0.15).toFixed(3));
  if (!name) return null;

  return { name, title, url, confidence, source: SOURCE };
}

function buildQuery(lead: DecisionMakerInput, domain: string): string {
  const roles = "(owner OR founder OR CEO OR president OR \"general manager\")";
  const parts = [
    `"${(lead.name || "").trim()}"`,
    domain ? domain : "",
    [lead.city, lead.state].filter(Boolean).join(" "),
    roles,
    "site:linkedin.com/in",
  ].filter(Boolean);
  return parts.join(" ");
}

// Look up decision makers for a single business. Returns [] on any failure or
// when no candidate clears the confidence floor. Never throws.
export async function findDecisionMakers(
  lead: DecisionMakerInput
): Promise<DecisionMaker[]> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return [];
  if (!lead.name?.trim()) return [];

  const domain = extractDomain(lead.website);
  const tokens = nameTokens(lead.name);
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", buildQuery(lead, domain));
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", key);

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results: SerpResult[] = Array.isArray(data.organic_results)
      ? data.organic_results
      : [];

    const seen = new Set<string>();
    const matches: DecisionMaker[] = [];
    for (const r of results) {
      const scored = scoreCandidate(r, lead, tokens, domain);
      if (!scored || scored.confidence < CONFIDENCE_FLOOR) continue;
      const dedup = scored.url.replace(/\/+$/, "").toLowerCase();
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      matches.push(scored);
    }

    matches.sort((a, b) => b.confidence - a.confidence);
    return matches.slice(0, MAX_MATCHES);
  } catch {
    return [];
  }
}
