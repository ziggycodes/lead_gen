// Builds and runs Overpass QL queries against the free OpenStreetMap Overpass API.
// No API key required. Includes retry + mirror endpoint fallback and polite delays.

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const DEFAULT_TIMEOUT_S = 180;

function escapeValue(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Build an Overpass QL query for a single niche within a US state admin area.
// Looks up both nodes and ways/relations and returns tags + a representative center.
export function buildQuery(stateIso, niche, { timeoutS = DEFAULT_TIMEOUT_S } = {}) {
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
    `out center tags;`,
  ].join("\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Run a query string against the Overpass API, rotating mirrors on failure.
// Optional `cache` ({ get(query), set(query, elements) }) lets callers (e.g. the
// web app) share results across users and skip upstream calls entirely.
export async function runQuery(query, { retries = 3, onLog = () => {}, cache = null } = {}) {
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
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const endpoint = MIRRORS[attempt % MIRRORS.length];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (DEFAULT_TIMEOUT_S + 30) * 1000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "leadgen-cli/1.0 (OpenStreetMap business lead research)",
        },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status === 504) {
        const wait = 5000 * (attempt + 1);
        onLog(`  rate-limited (${res.status}) on ${hostOf(endpoint)}, waiting ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${hostOf(endpoint)}`);
      }
      const json = await res.json();
      const elements = json.elements || [];
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
      onLog(`  query failed on ${hostOf(endpoint)} (${err.message}), retrying...`);
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(`Overpass query failed after ${retries} attempts: ${lastErr?.message}`);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export { sleep };
