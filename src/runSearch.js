// Shared lead-search pipeline used by BOTH the CLI (cli.js) and the web server
// (server.js). Resolves inputs, queries Overpass per state/niche, parses, dedupes,
// tags pain points, and (optionally) enriches. Emits progress via callbacks.

import pLimit from "p-limit";
import { getNiche } from "./niches.js";
import { listStateIsoCodes, resolveStateInput, stateNameFromIso } from "./usStates.js";
import { buildQuery, runQuery, sleep } from "./overpass.js";
import { elementToLead, dedupe } from "./parse.js";
import { inferPainPoint } from "./painPoints.js";
import { enrichLead, enrichmentStatus, enrichConcurrency, resetEnrichWarnings } from "./enrich.js";

// Resolve a comma-separated niche string into niche config objects.
export function resolveNiches(input, onLog = () => {}) {
  const keys = String(input).split(",").map((s) => s.trim()).filter(Boolean);
  const resolved = [];
  for (const k of keys) {
    const niche = getNiche(k);
    if (!niche) {
      onLog(`! Unknown niche "${k}" (skipped).`);
      continue;
    }
    resolved.push({ key: k.toLowerCase(), ...niche });
  }
  return resolved;
}

// Resolve a states string ("US"/"ALL" or comma-separated tokens) into ISO codes.
export function resolveStates(input, onLog = () => {}) {
  const trimmed = String(input).trim().toUpperCase();
  if (trimmed === "US" || trimmed === "ALL") return listStateIsoCodes();
  const tokens = String(input).split(",").map((s) => s.trim()).filter(Boolean);
  const resolved = [];
  for (const t of tokens) {
    const iso = resolveStateInput(t);
    if (!iso) {
      onLog(`! Unknown state "${t}" (skipped).`);
      continue;
    }
    resolved.push(iso);
  }
  return resolved;
}

// Build a small summary object from the collected leads.
export function summarize(leads) {
  const byNiche = {};
  let withPhone = 0;
  let withWebsite = 0;
  let withRating = 0;
  let llmEnriched = 0;
  for (const l of leads) {
    byNiche[l.niche] = (byNiche[l.niche] || 0) + 1;
    if (l.phone) withPhone++;
    if (l.website) withWebsite++;
    if (l.rating !== undefined && l.rating !== "") withRating++;
    if (l.llmEnriched) llmEnriched++;
  }
  return {
    total: leads.length,
    withPhone,
    withWebsite,
    withRating,
    llmEnriched,
    tier: enrichmentStatus().tier,
    byNiche,
  };
}

// Run the full search.
// opts: { niches, states, limit, delayMs, noEnrich, cache }
//   cache (optional): { get(query), set(query, elements) } for Overpass result reuse
// callbacks: { onLog, onProgress, onEnrichProgress({ done, total }), isCancelled }
export async function runSearch(opts, callbacks = {}) {
  const onLog = callbacks.onLog || (() => {});
  const onProgress = callbacks.onProgress || (() => {});
  const onEnrichProgress = callbacks.onEnrichProgress || (() => {});
  const isCancelled = callbacks.isCancelled || (() => false);

  const niches = resolveNiches(opts.niches, onLog);
  const states = resolveStates(opts.states, onLog);
  const limit = parseInt(opts.limit, 10) || 2000;
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 1200;

  if (niches.length === 0) throw new Error("No valid niches.");
  if (states.length === 0) throw new Error("No valid states.");

  const totalSteps = states.length * niches.length;
  let step = 0;
  const seen = new Set();
  const leads = [];

  outer: for (const stateIso of states) {
    for (const niche of niches) {
      if (leads.length >= limit) break outer;
      if (isCancelled()) {
        onLog("Search cancelled.");
        break outer;
      }
      step++;
      const stateName = stateNameFromIso(stateIso);
      let added = 0;
      try {
        const query = buildQuery(stateIso, niche);
        const elements = await runQuery(query, { onLog, cache: opts.cache || null });
        const rawLeads = elements
          .map((el) => elementToLead(el, { niche: niche.key, nicheLabel: niche.label, stateIso }))
          .filter(Boolean);
        const fresh = dedupe(rawLeads, seen);
        for (const lead of fresh) {
          const { painPoint, pitchAngle, signals } = inferPainPoint(lead, niche.category);
          lead.painPoint = painPoint;
          lead.pitchAngle = pitchAngle;
          lead.signals = signals;
          leads.push(lead);
          added++;
          if (leads.length >= limit) break;
        }
        onLog(`[${stateName} / ${niche.label}] +${added} new (total ${leads.length}/${limit})`);
      } catch (err) {
        onLog(`[${stateName} / ${niche.label}] failed: ${err.message}`);
      }
      onProgress({
        step,
        totalSteps,
        stateIso,
        stateName,
        niche: niche.label,
        added,
        total: leads.length,
        limit,
      });
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  // Auto-enrichment when API keys are present (unless --no-enrich).
  const status = enrichmentStatus();
  const shouldEnrich = !opts.noEnrich && status.tier !== "basic";

  if (shouldEnrich && leads.length) {
    resetEnrichWarnings();
    onLog(
      `Enriching ${leads.length} leads (tier=${status.tier}, serpapi=${status.serpapi.connected}, llm=${status.llm.connected})...`
    );
    const limiter = pLimit(enrichConcurrency());
    let done = 0;
    await Promise.all(
      leads.map((lead) =>
        limiter(async () => {
          if (isCancelled()) return;
          await enrichLead(lead, status, onLog);
          done++;
          onEnrichProgress({ done, total: leads.length });
        })
      )
    );
    onLog(`Enrichment complete (${done}/${leads.length} processed).`);
  }

  return { leads, summary: summarize(leads) };
}
