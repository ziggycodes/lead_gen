// Optional enrichment layer. Auto-detects API keys from .env:
//   SERPAPI_KEY        -> real Google Maps rating + review count
//   OPENAI_API_KEY     -> LLM pain point + pitch (preferred)
//   ANTHROPIC_API_KEY  -> LLM pain point + pitch (fallback if no OpenAI)
//
// No keys = basic mode (heuristics only). Never invents ratings.

let llmParseWarned = false;

function hasOpenAi() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function hasAnthropic() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function hasSerpApi() {
  return Boolean(process.env.SERPAPI_KEY?.trim());
}

function llmProvider() {
  if (hasOpenAi()) return "openai";
  if (hasAnthropic()) return "anthropic";
  return null;
}

function llmModel() {
  const provider = llmProvider();
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  return null;
}

export function enrichmentStatus() {
  const openai = hasOpenAi();
  const anthropic = hasAnthropic();
  const serpapi = hasSerpApi();
  const llmConnected = openai || anthropic;
  const provider = llmProvider();

  let tier = "basic";
  if (llmConnected && serpapi) tier = "llm+ratings";
  else if (llmConnected) tier = "llm";
  else if (serpapi) tier = "ratings";

  return {
    tier,
    llm: {
      connected: llmConnected,
      provider: provider || null,
      model: llmModel(),
    },
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
    llm: status.llm,
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

function buildLlmPrompt(lead) {
  const lines = [
    "You are a B2B sales researcher pitching AI voice agents and automations to US small businesses.",
    "Given the business below, return ONLY valid JSON with exactly these keys:",
    '  "painPoint": one concise sentence — the single most likely operational pain an AI phone agent could solve',
    '  "pitchAngle": one concise sentence — how to pitch an AI voice agent to this business',
    "",
    `Business: ${lead.name}`,
    `Niche: ${lead.niche}`,
    `State: ${lead.state}`,
    `City: ${lead.city || "unknown"}`,
    `Has website: ${Boolean(lead.website)}`,
    `Has phone: ${Boolean(lead.phone)}`,
    `Signals: ${lead.signals || "none"}`,
  ];
  if (lead.rating !== undefined && lead.rating !== "") {
    lines.push(`Google rating: ${lead.rating} stars (${lead.reviewCount || "?"} reviews)`);
    lines.push("Use the rating/review data as a signal when relevant (e.g. low rating + high volume may indicate phone/service issues).");
  }
  lines.push("", "Respond with JSON only, no markdown.");
  return lines.join("\n");
}

function parseLlmJson(text) {
  if (!text) return null;
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const obj = JSON.parse(raw);
    if (obj.painPoint && obj.pitchAngle) return obj;
  } catch {
    /* fall through */
  }
  return null;
}

async function callOpenAi(prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: llmModel(),
      messages: [
        { role: "system", content: "You output only valid JSON objects." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 200,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${err.slice(0, 120)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callAnthropic(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: llmModel(),
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}: ${err.slice(0, 120)}`);
  }
  const data = await res.json();
  const block = data.content?.find((b) => b.type === "text");
  return block?.text?.trim() || "";
}

async function enrichWithLlm(lead, onLog = () => {}) {
  const provider = llmProvider();
  if (!provider) return {};

  const prompt = buildLlmPrompt(lead);
  try {
    const text = provider === "openai" ? await callOpenAi(prompt) : await callAnthropic(prompt);
    const parsed = parseLlmJson(text);
    if (!parsed) {
      if (!llmParseWarned) {
        onLog("LLM returned unparseable JSON for a lead; keeping heuristic pain point.");
        llmParseWarned = true;
      }
      return {};
    }
    return {
      painPoint: parsed.painPoint.trim(),
      pitchAngle: parsed.pitchAngle.trim(),
      llmEnriched: true,
      llmProvider: provider,
    };
  } catch (err) {
    if (!llmParseWarned) {
      onLog(`LLM enrichment error: ${err.message}`);
      llmParseWarned = true;
    }
    return {};
  }
}

// Enrich a single lead: SerpApi first (ratings), then LLM (copy).
export async function enrichLead(lead, status = enrichmentStatus(), onLog = () => {}) {
  if (lead.painPoint && !lead.painPointHeuristic) {
    lead.painPointHeuristic = lead.painPoint;
    lead.pitchAngleHeuristic = lead.pitchAngle;
  }

  if (status.serpapi.connected) {
    Object.assign(lead, await enrichWithSerpApi(lead));
  }
  if (status.llm.connected) {
    Object.assign(lead, await enrichWithLlm(lead, onLog));
  }
  return lead;
}

// Reset per-run warning flags (call before a batch).
export function resetEnrichWarnings() {
  llmParseWarned = false;
}
