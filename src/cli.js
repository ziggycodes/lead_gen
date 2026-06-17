#!/usr/bin/env node
// Free Lead-Gen CLI: collect US business leads from OpenStreetMap, tag a likely
// pain point for AI voice-agent / automation outreach, and export to CSV/XLSX.
// The actual search pipeline lives in runSearch.js (shared with the web server).

import "./loadEnv.js";
import { Command } from "commander";
import { listNicheKeys, NICHES } from "./niches.js";
import { runSearch } from "./runSearch.js";
import { writeLeads } from "./output.js";

const program = new Command();

program
  .name("leadgen")
  .description("Collect US business leads (free, via OpenStreetMap) with AI voice-agent pain points.")
  .option("-n, --niches <list>", "comma-separated niche keys (see --list-niches)", "dentist,salon,plumber,restaurant")
  .option("-s, --states <list>", 'comma-separated states (ISO "US-CA", abbr "CA", name, or "US" for all)', "US")
  .option("-l, --limit <number>", "max total leads to collect", "2000")
  .option("-o, --out <path>", "output file path", "leads.xlsx")
  .option("-f, --format <fmt>", "output format: csv or xlsx (inferred from --out if omitted)")
  .option("--delay <ms>", "delay between Overpass queries (be polite)", "1200")
  .option("--no-enrich", "skip auto LLM/ratings enrichment even if API keys are set", false)
  .option("--list-niches", "print available niche keys and exit", false);

program.parse(process.argv);
const opts = program.opts();

function log(msg) {
  process.stdout.write(msg + "\n");
}

if (opts.listNiches) {
  log("Available niches:\n");
  for (const key of listNicheKeys()) {
    log(`  ${key.padEnd(16)} -> ${NICHES[key].label} [${NICHES[key].category}]`);
  }
  process.exit(0);
}

async function main() {
  log("=== Lead-Gen run ===");
  log(`Niches : ${opts.niches}`);
  log(`States : ${opts.states}`);
  log(`Limit  : ${opts.limit}`);
  log(`Output : ${opts.out}`);
  log("");

  const { leads, summary } = await runSearch(
    {
      niches: opts.niches,
      states: opts.states,
      limit: opts.limit,
      delayMs: parseInt(opts.delay, 10) || 0,
      noEnrich: opts.noEnrich,
    },
    { onLog: log }
  );

  if (leads.length === 0) {
    log("\nNo leads collected. Try different niches/states.");
    process.exit(0);
  }

  const fmt = await writeLeads(leads, opts.out, opts.format);
  log(`\nDone. Wrote ${leads.length} leads to ${opts.out} (${fmt}).`);
  log(`Mode: ${summary.tier} | Contactable: ${summary.withPhone} phone, ${summary.withWebsite} website.`);
  if (summary.withRating) log(`Ratings: ${summary.withRating} leads with Google ratings.`);
  if (summary.llmEnriched) log(`LLM: ${summary.llmEnriched} leads enriched.`);
  log("By niche: " + Object.entries(summary.byNiche).map(([k, v]) => `${k}=${v}`).join(", "));
}

main().catch((err) => {
  log("Fatal error: " + err.message);
  process.exit(1);
});
