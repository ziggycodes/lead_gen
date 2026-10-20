// Shared lead-search pipeline used by BOTH the CLI (cli.js) and the web server
// (server.js). Resolves inputs, queries Overpass per state/niche, parses, dedupes,
// and (optionally) enriches. Emits progress via callbacks.

import pLimit from "p-limit";
import { getNiche } from "./niches.js";
import { listStateIsoCodes, resolveStateInput, stateNameFromIso } from "./usStates.js";
import { buildQuery, runQuery, sleep, capForElements } from "./overpass.js";
import { elementToLead, dedupe } from "./parse.js";
import { enrichLead, enrichmentStatus, enrichConcurrency, resetEnrichWarnings } from "./enrich.js";
import { scrapeContacts } from "./contactScrape.js";
import { isContactable } from "./contactable.js";

// OSM hits are often name-only. Over-fetch so we can still fill `limit` after
// dropping businesses with no phone and no email.
const CONTACTABLE_OVERFETCH = 8;
const ADMISSION_SCRAPE_MULT = 4;
const ADMISSION_SCRAPE_CAP = 80;

async function scrapeWebsites(targets, { onLog, onContactProgress, isCancelled }) {
  if (!targets.length) return;
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
  for (const l of leads) {
    byNiche[l.niche] = (byNiche[l.niche] || 0) + 1;
    if (l.phone) withPhone++;
    if (l.website) withWebsite++;
    if (l.email) withEmail++;
    if (l.rating !== undefined && l.rating !== "") withRating++;
  }
  return {
    total: leads.length,
    withPhone,
    withWebsite,
    withEmail,
    withRating,
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
        const remaining = Math.max(1, limit - leads.length);
        const query = buildQuery(stateIso, niche, {
          maxElements: capForElements(remaining * CONTACTABLE_OVERFETCH),
        });
        const elements = await runQuery(query, { onLog, cache: opts.cache || null, isCancelled });
        const rawLeads = elements
          .map((el) => elementToLead(el, { niche: niche.key, nicheLabel: niche.label, stateIso }))
          .filter(Boolean);
        const fresh = dedupe(rawLeads, seen);
        const ready = [];
        const scrapeForEmail = [];
        const scrapeForAdmission = [];
        for (const lead of fresh) {
          if (isContactable(lead)) {
            if (leads.length >= limit) break;
            leads.push(lead);
            ready.push(lead);
            if (opts.scrapeContacts && lead.website && !lead.email) scrapeForEmail.push(lead);
          } else if (lead.website) {
            scrapeForAdmission.push(lead);
          }
        }
        if (ready.length) onLeads(ready);

        if (opts.scrapeContacts && scrapeForEmail.length && !isCancelled()) {
          await scrapeWebsites(scrapeForEmail, { onLog, onContactProgress, isCancelled });
        }

        const admitted = [];
        if (opts.scrapeContacts && leads.length < limit && scrapeForAdmission.length && !isCancelled()) {
          const slots = (limit - leads.length) * ADMISSION_SCRAPE_MULT;
          const batch = scrapeForAdmission.slice(0, Math.min(slots, ADMISSION_SCRAPE_CAP));
          await scrapeWebsites(batch, { onLog, onContactProgress, isCancelled });
          for (const lead of batch) {
            if (leads.length >= limit) break;
            if (!isContactable(lead)) continue;
            leads.push(lead);
            admitted.push(lead);
          }
          if (admitted.length) onLeads(admitted);
        }

        added = ready.length + admitted.length;
        onLog(`[${stateName} / ${niche.label}] +${added} contactable (total ${leads.length}/${limit})`);
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

  const dropped = leads.filter((l) => !isContactable(l)).length;
  if (dropped) {
    const kept = leads.filter(isContactable);
    leads.length = 0;
    leads.push(...kept);
    onLog(`Dropped ${dropped} leads with no phone or email.`);
  }

  // Auto-enrichment when API keys are present (unless --no-enrich).
  const status = enrichmentStatus();
  const shouldEnrich = !opts.noEnrich && status.tier !== "basic";

  if (shouldEnrich && leads.length) {
    resetEnrichWarnings();
    onLog(`Enriching ${leads.length} leads with Google ratings (tier=${status.tier})...`);
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
