# Free Lead-Gen CLI

A reusable, **free** command-line tool that collects US business leads from
[OpenStreetMap](https://www.openstreetmap.org/) (via the Overpass API), tags each
lead with a most-likely **pain point** and a tailored **AI voice-agent / automation
pitch angle**, and exports everything to CSV or Excel.

No API key. No per-request cost. No Google Maps scraping / blocking risk.

## What you get per lead

| Column | Description |
| --- | --- |
| Business Name | Name of the business |
| Niche | Friendly niche label (e.g. "Dental Practice") |
| State / City | Derived from OSM address + admin area |
| Phone / Website / Email | Public contact info (when present in OSM) |
| Address | Best-effort full street address |
| Rating / Reviews | Google star rating + review count (only when SerpApi key is set) |
| Likely Pain Point | Heuristic or LLM-refined pain point |
| Suggested Pitch Angle | Heuristic or LLM-refined pitch |
| Signals | Why (e.g. "no website", "phone-only") |
| Source (OSM) | Link to the source record |

## Requirements

- Node.js 18+ (tested on v22)

## Setup

```bash
npm install
cp .env.example .env   # optional — add API keys for LLM/ratings enrichment
```

### Enrichment tiers (auto-detected)

| Tier | Keys in `.env` | What you get |
| --- | --- | --- |
| **Basic** (default) | none | OSM leads + free heuristic pain points |
| **LLM** | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Smarter pain points + pitch angles per lead |
| **LLM + Ratings** | LLM key + `SERPAPI_KEY` | Real Google ratings + LLM copy informed by stars/reviews |

Enrichment **runs automatically** when keys are present. Use `--no-enrich` (CLI) to skip it.

**Cost note:** LLM enrichment = ~1 API call per lead. 500 leads ≈ 500 calls. SerpApi is also per-search.

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=        # alternative LLM
SERPAPI_KEY=              # optional: real Google ratings
ENRICH_CONCURRENCY=3
```

## Web app (localhost)

Prefer a UI over the command line? Run the bundled dashboard:

```bash
npm run web
# then open http://localhost:3000
```

You get a styled dashboard to pick niches (chips) and states, set a lead limit,
watch live progress as it searches, browse/filter results in a table, and download
CSV or Excel with one click. The header badge shows your enrichment tier (Basic /
LLM / LLM + Google ratings) based on `.env` keys. The web app and the CLI share
the exact same core pipeline (`src/runSearch.js`), so results are identical.

## CLI usage

```bash
# Default: dentist/salon/plumber/restaurant across all US states, up to 2000 leads -> leads.xlsx
node src/cli.js

# Specific niches + specific states, CSV output
node src/cli.js --niches hvac,plumber,electrician --states US-TX,US-FL --limit 500 --out trades.csv

# Single niche, single state
node src/cli.js --niches dentist --states CA --limit 300 --out ca_dentists.xlsx

# All US states, mixed niches, full 2000 cap
node src/cli.js --niches dentist,salon,plumber,restaurant,lawyer --states US --limit 2000 --out leads.xlsx

# See every available niche
node src/cli.js --list-niches
```

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `-n, --niches <list>` | `dentist,salon,plumber,restaurant` | Comma-separated niche keys (`--list-niches`) |
| `-s, --states <list>` | `US` | `US`/`ALL` for every state, or `US-CA`, `CA`, or `California` |
| `-l, --limit <number>` | `2000` | Max total leads to collect |
| `-o, --out <path>` | `leads.xlsx` | Output file path |
| `-f, --format <fmt>` | inferred | `csv` or `xlsx` (otherwise inferred from `--out`) |
| `--delay <ms>` | `1200` | Delay between Overpass queries (be polite) |
| `--no-enrich` | off | Skip auto LLM/ratings enrichment even if API keys are set |
| `--list-niches` | | Print available niches and exit |

### State input

You can pass states as ISO codes (`US-CA`), 2-letter abbreviations (`CA`), full
names (`California`), or `US` / `ALL` for all 50 states + DC.

## How pain points are inferred

Each niche maps to a category (e.g. `appointment_medical`, `trades`, `food`). Each
category has a base pain point framed around phone/booking workflows that AI voice
agents solve. The engine then sharpens it using **signals** detected in the data:

- **No website** -> phone-dependent, no online lead-capture path
- **Phone-only** -> every missed call is lost revenue
- **No phone/email** -> minimal digital footprint, hard to reach
- **No opening hours** -> after-hours calls likely unanswered

This is fully offline and free in **basic mode**. With an LLM key, pain points and
pitches are rewritten per lead. See `src/painPoints.js` and `src/enrich.js`.

## Optional enrichment (auto when keys are set)

OSM has no review/rating data. Add keys to `.env` — enrichment runs automatically
after each search (no checkbox or flag needed):

```bash
# Windows PowerShell — copy .env.example to .env and fill in keys, then:
npm run web
# Dashboard badge shows: Basic mode | LLM connected | LLM + Google ratings
```

Ratings are **never invented** — the Rating column stays empty unless SerpApi returns data.
Use `--no-enrich` on the CLI to force basic mode.

## Notes & limitations

- **Coverage varies by area.** OSM is community-maintained, so phone/website fields
  are present on many but not all businesses. Missing fields double as pain-point
  signals.
- **Be polite.** The tool rotates between public Overpass mirrors and rate-limits
  itself. Large all-US runs can take a while; lower `--limit` for quick batches.
- Re-run any time with different niches/states. It de-duplicates within a single run
  (by phone, else name + location).

## Project structure

```
server.js          # Express web server (serves dashboard + API)
public/            # web dashboard (index.html, app.js, style.css)
src/
  cli.js           # CLI entry: flags + output
  runSearch.js     # shared search pipeline (used by CLI AND web server)
  niches.js        # niche -> OSM tag filters + pain-point category
  usStates.js      # US state ISO codes + input resolution
  overpass.js      # Overpass QL builder + fetch (retry + mirror fallback)
  parse.js         # OSM element -> lead record, dedupe, state/city
  painPoints.js    # heuristic pain-point + pitch-angle engine
  output.js        # CSV / XLSX writers + in-memory buffers (for downloads)
  loadEnv.js       # loads .env at startup
  enrich.js        # auto SerpApi ratings + LLM enrichment (tier detection)
```

The layering (core pipeline -> CLI / HTTP API -> UI) is intentional so the tool can
later be lifted into a hosted SaaS by swapping in a different frontend/auth layer
while keeping `src/` untouched.
