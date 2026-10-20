// Optional enrichment layer. Auto-detects API keys from .env:
//   SERPAPI_KEY -> real Google Maps rating + review count
//
// No key = basic mode. Never invents ratings.

function hasSerpApi() {
  return Boolean(process.env.SERPAPI_KEY?.trim());
}

export function enrichmentStatus() {
  const serpapi = hasSerpApi();
  return {
    tier: serpapi ? "ratings" : "basic",
    serpapi: { connected: serpapi },
  };
}

export function enrichConcurrency() {
  const n = parseInt(process.env.ENRICH_CONCURRENCY, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Public config for GET /api/config (never exposes keys).
export function publicConfig() {
  const status = enrichmentStatus();
  return {
    tier: status.tier,
    serpapi: status.serpapi,
  };
}

function parseReviewCount(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number") return raw;
  const s = String(raw).replace(/,/g, "").trim();
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : "";
}

async function enrichWithSerpApi(lead) {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return {};
  const q = [lead.name, lead.city, lead.state].filter(Boolean).join(" ");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("type", "search");
  url.searchParams.set("q", q);
  url.searchParams.set("api_key", key);
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const top = data.local_results?.[0] || data.place_results;
    if (!top) return {};
    const rating = top.rating ?? "";
    const reviewCount = parseReviewCount(top.reviews);
    if (rating === "" && reviewCount === "") return {};
    return {
      rating,
      reviewCount,
      ratingSource: "google/serpapi",
    };
  } catch {
    return {};
  }
}

export async function enrichLead(lead, status = enrichmentStatus()) {
  if (status.serpapi.connected) {
    Object.assign(lead, await enrichWithSerpApi(lead));
  }
  return lead;
}

// Kept for callers that reset per-run state before a batch.
export function resetEnrichWarnings() {}
