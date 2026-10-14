// Builds and runs Overpass QL queries against the free OpenStreetMap Overpass API.
// No API key required. Includes retry + mirror endpoint fallback and polite delays.

const DEFAULT_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const MIRRORS = (process.env.OVERPASS_MIRRORS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (MIRRORS.length === 0) MIRRORS.push(...DEFAULT_MIRRORS);

// A statewide query for a common niche takes ~75s upstream, so the server-side
// budget has to sit comfortably above that.
const DEFAULT_TIMEOUT_S = 120;
const REQUEST_TIMEOUT_MS = (DEFAULT_TIMEOUT_S + 15) * 1000;
// Health check: cheap enough to fire at every mirror at once.
const PROBE_TIMEOUT_MS = 12_000;
// Upper bound on the time a single query may spend retrying across mirrors.
const QUERY_DEADLINE_MS = 6 * 60 * 1000;

const USER_AGENT = "leadgen-cli/1.0 (OpenStreetMap business lead research)";

// Overpass truncates output when `out` ends with a number. Results are cached by
// query string, so the cap is snapped to a bucket to keep those strings stable.
const CAP_BUCKETS = [100, 250, 500, 1000, 2500];
export const MAX_ELEMENTS_PER_QUERY = CAP_BUCKETS[CAP_BUCKETS.length - 1];

export function capForElements(wanted) {
  const n = Math.max(1, Math.ceil(wanted));
  return CAP_BUCKETS.find((b) => b >= n) ?? MAX_ELEMENTS_PER_QUERY;
}

function escapeValue(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Build an Overpass QL query for a single niche within a US state admin area.
// Looks up both nodes and ways/relations and returns tags + a representative center.
export function buildQuery(
  stateIso,
  niche,
  { timeoutS = DEFAULT_TIMEOUT_S, maxElements = MAX_ELEMENTS_PER_QUERY } = {}
) {
  const lines = [];
  for (const f of niche.filters) {
    const sel = `["${escapeValue(f.k)}"="${escapeValue(f.v)}"]`;
    lines.push(`  nwr${sel}(area.searchArea);`);
  }
  return [
    `[out:json][timeout:${timeoutS}];`,
    `area["ISO3166-2"="${escapeValue(stateIso)}"][admin_level=4]->.searchArea;`,
    `(`,
    lines.join("\n"),
    `);`,
    `out center tags ${maxElements};`,
  ].join("\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postQuery(endpoint, query, timeoutMs) {
  // #region agent log
  fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e14203" },
    body: JSON.stringify({
      sessionId: "e14203",
      runId: "pre-fix",
      hypothesisId: "D",
      location: "overpass.js:postQuery",
      message: "overpass request starting",
      data: { host: hostOf(endpoint), timeoutMs, queryBytes: query.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("non-JSON response");
  }
  // Overpass reports some failures as HTTP 200 with a `remark` and no elements.
  if (!json.elements?.length && json.remark) throw new Error(json.remark.trim());
  return json.elements || [];
}

// The mirrors fail independently and a dead one can hang for minutes, so a tiny
// probe decides which endpoint gets the expensive query. Sticky for the process.
const PROBE_QUERY =
  '[out:json][timeout:10];node["amenity"="cafe"](39.94,-75.17,39.96,-75.15);out ids 1;';

// A mirror that just refused work is unlikely to accept the next query either.
// Hangs are parked far longer than refusals: they cost a full request timeout
// every time rotation reaches them, whereas a 429/504 comes back in seconds.
const BUSY_COOLDOWN_MS = 2 * 60 * 1000;
const HANG_COOLDOWN_MS = 10 * 60 * 1000;

const cooldownUntil = new Map();
let preferredMirror = null;
let election = null;

function markUnhealthy(endpoint, err) {
  // AbortSignal.timeout rejects with a TimeoutError; anything else (429, 504,
  // a server-busy remark) came back quickly and is worth retrying sooner.
  const hung = err?.name === "TimeoutError";
  cooldownUntil.set(endpoint, Date.now() + (hung ? HANG_COOLDOWN_MS : BUSY_COOLDOWN_MS));
  if (preferredMirror === endpoint) preferredMirror = null;
}

// Healthy mirrors first (preferred one leading); if every mirror is cooling
// down, fall back to whichever recovers soonest rather than giving up.
function candidateOrder() {
  const now = Date.now();
  const healthy = MIRRORS.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  const pool = healthy.length
    ? healthy
    : [...MIRRORS].sort((a, b) => (cooldownUntil.get(a) ?? 0) - (cooldownUntil.get(b) ?? 0));
  if (preferredMirror && pool.includes(preferredMirror)) {
    return [preferredMirror, ...pool.filter((m) => m !== preferredMirror)];
  }
  return pool;
}

async function electMirror(onLog) {
  if (election) return election;
  const probes = MIRRORS.map((endpoint) => {
    const probe = postQuery(endpoint, PROBE_QUERY, PROBE_TIMEOUT_MS).then(() => endpoint);
    // Record health for every mirror, not just the winner, so the losers are
    // skipped later instead of costing a full timeout each.
    probe.catch((err) => markUnhealthy(endpoint, err));
    return probe;
  });
  election = Promise.any(probes)
    .then((endpoint) => {
      preferredMirror = endpoint;
      cooldownUntil.delete(endpoint);
      onLog(`  using Overpass mirror ${hostOf(endpoint)}`);
      return endpoint;
    })
    .catch(() => null)
    .finally(() => {
      election = null;
    });
  return election;
}

// Run a query string against the Overpass API, rotating mirrors on failure.
// Optional `cache` ({ get(query), set(query, elements) }) lets callers (e.g. the
// web app) share results across users and skip upstream calls entirely.
export async function runQuery(
  query,
  { retries = MIRRORS.length * 2, onLog = () => {}, cache = null, isCancelled = () => false } = {}
) {
  if (cache) {
    try {
      const cached = await cache.get(query);
      if (cached) {
        onLog("  cache hit (skipping Overpass)");
        return cached;
      }
    } catch {
      // Cache failures must never break the search; fall through to the network.
    }
  }

  // Probe once up front so the first real query doesn't get spent on a mirror
  // that hangs. After that the cooldown map already knows who is healthy.
  if (!preferredMirror && cooldownUntil.size === 0) await electMirror(onLog);

  const deadline = Date.now() + QUERY_DEADLINE_MS;
  // Every mirror gets a turn before any of them is retried. Without this a
  // mirror that fails fast keeps sorting ahead of peers cooling down longer,
  // and the retries all land on the endpoint that just rejected us.
  const tried = new Set();
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (isCancelled()) throw new Error("cancelled");
    if (Date.now() >= deadline) break;
    let order = candidateOrder().filter((m) => !tried.has(m));
    if (order.length === 0) {
      tried.clear();
      order = candidateOrder();
    }
    const endpoint = order[0];
    tried.add(endpoint);
    try {
      const elements = await postQuery(endpoint, query, REQUEST_TIMEOUT_MS);
      preferredMirror = endpoint;
      cooldownUntil.delete(endpoint);
      if (cache) {
        try {
          await cache.set(query, elements);
        } catch {
          // Best-effort write; ignore cache errors.
        }
      }
      return elements;
    } catch (err) {
      lastErr = err;
      markUnhealthy(endpoint, err);
      onLog(`  ${hostOf(endpoint)} unavailable (${err.message}), trying another mirror...`);
    }
    // Back off only once every mirror in the pool has been tried.
    const cycle = Math.floor(attempt / MIRRORS.length) + 1;
    if ((attempt + 1) % MIRRORS.length === 0) await sleep(Math.min(5000 * cycle, 20_000));
  }
  throw new Error(`Overpass unavailable after ${retries} attempts: ${lastErr?.message}`);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export { sleep };
