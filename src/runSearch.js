// Shared lead-search pipeline used by BOTH the CLI (cli.js) and the web server
// (server.js). Resolves inputs, queries Overpass per state/niche, parses, dedupes,
// tags pain points, and (optionally) enriches. Emits progress via callbacks.

import pLimit from "p-limit";
import { getNiche } from "./niches.js";
import { listStateIsoCodes, resolveStateInput, stateNameFromIso } from "./usStates.js";
import { buildQuery, runQuery, sleep, capForElements } from "./overpass.js";
import { elementToLead, dedupe } from "./parse.js";
import { inferPainPoint } from "./painPoints.js";
import { enrichLead, enrichmentStatus, enrichConcurrency, resetEnrichWarnings } from "./enrich.js";
import { scrapeContacts } from "./contactScrape.js";

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
  let withEmail = 0;
  let withRating = 0;
  let llmEnriched = 0;
  for (const l of leads) {
    byNiche[l.niche] = (byNiche[l.niche] || 0) + 1;
    if (l.phone) withPhone++;
    if (l.website) withWebsite++;
    if (l.email) withEmail++;
    if (l.rating !== undefined && l.rating !== "") withRating++;
    if (l.llmEnriched) llmEnriched++;
  }
  return {
    total: leads.length,
    withPhone,
    withWebsite,
    withEmail,
    withRating,
    llmEnriched,
    tier: enrichmentStatus().tier,
    byNiche,
  };
}

// Run the full search.
// opts: { niches, states, limit, delayMs, noEnrich, cache }
//   cache (optional): { get(query), set(query, elements) } for Overpass result reuse
// callbacks: { onLog, onProgress, onLeads(freshLeads), onEnrichProgress({ done, total }), isCancelled }
export async function runSearch(opts, callbacks = {}) {
  const onLog = callbacks.onLog || (() => {});
  const onProgress = callbacks.onProgress || (() => {});
  const onLeads = callbacks.onLeads || (() => {});
  const onEnrichProgress = callbacks.onEnrichProgress || (() => {});
  const onContactProgress = callbacks.onContactProgress || (() => {});
  const onDecisionMakerProgress = callbacks.onDecisionMakerProgress || (() => {});
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
        // Ask Overpass for a bounded slice rather than every POI in the state:
        // unnamed and duplicate entries get dropped, so over-fetch what's left
        // to collect. Uncapped statewide queries routinely time out upstream.
        const query = buildQuery(stateIso, niche, {
          maxElements: capForElements((limit - leads.length) * 3),
        });
        // #region agent log
        fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e14203" },
          body: JSON.stringify({
            sessionId: "e14203",
            runId: "pre-fix",
            hypothesisId: "D",
            location: "runSearch.js:before-query",
            message: "starting overpass query",
            data: { stateIso, niche: niche.key, step, totalSteps, leads: leads.length },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        const elements = await runQuery(query, { onLog, cache: opts.cache || null, isCancelled });
        // #region agent log
        fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
          body: JSON.stringify({
            sessionId: "b660e9",
            runId: "pre-fix",
            hypothesisId: "B",
            location: "runSearch.js:query",
            message: "overpass step returned",
            data: { stateIso, niche: niche.key, elements: elements.length },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        const rawLeads = elements
          .map((el) => elementToLead(el, { niche: niche.key, nicheLabel: niche.label, stateIso }))
          .filter(Boolean);
        const fresh = dedupe(rawLeads, seen);
        const accepted = [];
        for (const lead of fresh) {
          const { painPoint, pitchAngle, signals } = inferPainPoint(lead, niche.category);
          lead.painPoint = painPoint;
          lead.pitchAngle = pitchAngle;
          lead.signals = signals;
          leads.push(lead);
          accepted.push(lead);
          added++;
          if (leads.length >= limit) break;
        }
        if (accepted.length) onLeads(accepted);
        onLog(`[${stateName} / ${niche.label}] +${added} new (total ${leads.length}/${limit})`);
      } catch (err) {
        // #region agent log
        fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b660e9" },
          body: JSON.stringify({
            sessionId: "b660e9",
            runId: "pre-fix",
            hypothesisId: "B",
            location: "runSearch.js:fail",
            message: "overpass step failed",
            data: { stateIso, niche: niche.key, error: err.message },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
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

  // Contact scraping (free). Runs independently of enrichment: pull emails and
  // LinkedIn links off each lead's own website. Only leads that have a website
  // but no email are worth the fetch.
  if (opts.scrapeContacts && leads.length) {
    const targets = leads.filter((l) => l.website && !l.email);
    if (targets.length) {
      onLog(`Scraping ${targets.length} websites for contact info...`);
      const limiter = pLimit(8);
      let done = 0;
      await Promise.all(
        targets.map((lead) =>
          limiter(async () => {
            if (isCancelled()) return;
            try {
              const { emails, linkedInProfiles } = await scrapeContacts(lead.website);
              if (emails.length) {
                lead.email = emails[0];
                lead.emailSource = "website";
                lead.emailsFound = emails;
              }
              if (linkedInProfiles.length) {
                lead.websiteLinkedIn = linkedInProfiles[0];
              }
            } catch {
              /* never let one bad site fail the run */
            }
            done++;
            onContactProgress({ done, total: targets.length });
          })
        )
      );
      onLog(`Contact scrape complete (${done}/${targets.length} sites).`);
    }
  }

  // Decision-maker lookup (SerpApi). The lookup function is injected by the
  // caller so this JS module never imports the TS lib. Capped by a per-search
  // budget because each lead costs one SerpApi search.
  const findDM = typeof opts.findDecisionMakers === "function" ? opts.findDecisionMakers : null;
  if (findDM && leads.length) {
    const budget =
      Number.isFinite(opts.decisionMakerLimit) && opts.decisionMakerLimit > 0
        ? opts.decisionMakerLimit
        : leads.length;
    // Priority: leads with both a website and phone are the most contactable,
    // then website-only, then phone-only, then the rest.
    const score = (l) => (l.website ? 2 : 0) + (l.phone ? 1 : 0);
    const ordered = leads
      .map((lead, idx) => ({ lead, idx }))
      .sort((a, b) => score(b.lead) - score(a.lead) || a.idx - b.idx);
    const targets = ordered.slice(0, budget).map((o) => o.lead);
    onLog(`Decision-maker lookup: ${targets.length}/${leads.length} leads (SerpApi budget).`);
    const limiter = pLimit(2);
    let done = 0;
    await Promise.all(
      targets.map((lead) =>
        limiter(async () => {
          if (isCancelled()) return;
          try {
            const matches = await findDM({
              name: lead.name,
              city: lead.city,
              state: lead.state,
              website: lead.website,
            });
            lead.decisionMakers = matches;
            lead.decisionMakerStatus = matches.length > 0 ? "found" : "none";
          } catch {
            lead.decisionMakerStatus = "error";
          }
          done++;
          onDecisionMakerProgress({ done, total: targets.length });
        })
      )
    );
    onLog(`Decision-maker lookup complete (${done}/${targets.length} processed).`);
  }

  return { leads, summary: summarize(leads) };
}
