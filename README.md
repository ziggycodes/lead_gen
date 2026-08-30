# LeadScout

**Find US business leads with ready-made pitch angles.**

LeadScout is a hosted SaaS (Next.js) plus a CLI that collects US business leads from
[OpenStreetMap](https://www.openstreetmap.org/) (via the free Overpass API), tags each
lead with a most-likely **pain point** and a tailored **pitch angle**, and exports
everything to CSV or Excel.

- **Web app** — sign up, get 50 free leads, buy Naira credit packs via Paystack.
- **CLI** — the original free power-user tool, unchanged.

## What you get per lead

| Column | Description |
| --- | --- |
| Business Name | Name of the business |
| Niche | Friendly niche label (e.g. "Dental Practice") |
| State / City | Derived from OSM address + admin area |
| Phone / Website / Email | Public contact info (when present in OSM) |
| Address | Best-effort full street address |
| Likely Pain Point | Heuristic pain point |
| Suggested Pitch Angle | Outreach angle for that pain point |
| Signals | Why (e.g. "no website", "phone-only") |
| Source (OSM) | Link to the source record |

## Web app (the SaaS)

### Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Clerk** — authentication (free tier; runs keyless in dev)
- **Postgres + Drizzle** — users, usage/quota, searches, Overpass cache (free tier: Neon/Supabase)
- **Paystack** — NGN credit-pack payments (test keys in dev)

### Business rules

- Every account gets **50 free leads** (lifetime trial).
- **50 leads/day** fair-use cap for all accounts.
- Credit packs: Starter ₦500 / 150 leads, Standard ₦1,500 / 500 leads, Pro ₦3,000 / 1,200 leads. Credits never expire.
- Quotas use an atomic **reserve → run → reconcile** flow, so parallel searches can't overspend, and failed runs don't burn credits.
- Overpass responses are **cached for 7 days** and shared across users.
- Optional Nigeria-only gate via `ALLOWED_COUNTRIES=NG` (needs a country header from your host/CDN, e.g. Cloudflare).

### Setup

```bash
npm install
copy .env.example .env    # then fill in values (see below)

# Create the database tables (needs DATABASE_URL)
npm run db:push

# Run the app
npm run dev               # http://localhost:3000
```

Required env vars (see `.env.example` for the full list):

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Free Postgres from [neon.tech](https://neon.tech) or Supabase |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Free app at [clerk.com](https://clerk.com) (dev can run keyless) |
| `PAYSTACK_SECRET_KEY` / `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | [dashboard.paystack.com](https://dashboard.paystack.com) — use test keys first |
| `NEXT_PUBLIC_APP_URL` | Your deployed URL (used for the Paystack callback) |

For Paystack webhooks, set the webhook URL in the Paystack dashboard to
`https://<your-domain>/api/webhooks/paystack`.

### Deploying (Railway)

Searches stream for several minutes, so deploy on a host with persistent processes
(Railway/Render), not serverless. On Railway: create a project from this repo, add a
Postgres plugin (or use Neon), set the env vars, and it builds and runs `npm run build`
/ `npm start` automatically. Health check: `GET /api/health`.

## CLI usage (free, no account)

```bash
# Default: dentist/salon/plumber/restaurant across all US states -> leads.xlsx
npm run cli

# Specific niches + states, CSV output
node src/cli.js --niches hvac,plumber,electrician --states US-TX,US-FL --limit 500 --out trades.csv

# See every available niche
node src/cli.js --list-niches
```

| Flag | Default | Description |
| --- | --- | --- |
| `-n, --niches <list>` | `dentist,salon,plumber,restaurant` | Comma-separated niche keys (`--list-niches`) |
| `-s, --states <list>` | `US` | `US`/`ALL` for every state, or `US-CA`, `CA`, or `California` |
| `-l, --limit <number>` | `2000` | Max total leads to collect |
| `-o, --out <path>` | `leads.xlsx` | Output file path |
| `-f, --format <fmt>` | inferred | `csv` or `xlsx` |
| `--delay <ms>` | `1200` | Delay between Overpass queries (be polite) |
| `--no-enrich` | off | Skip auto LLM/ratings enrichment even if API keys are set |

The legacy localhost dashboard is still available via `npm run web:legacy`.

### Optional enrichment (CLI only for now)

With `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` (and optionally `SERPAPI_KEY`) in `.env`,
the CLI rewrites pain points/pitches per lead and adds Google ratings. The web app
deliberately keeps enrichment off — LLM/SerpApi bill in USD, which doesn't fit the
NGN price points (see the launch plan).

## How pain points are inferred

Each niche maps to a category (e.g. `appointment_medical`, `trades`, `food`) with a
base pain point framed around phone/booking workflows. The engine sharpens it with
**signals** detected in the data:

- **No website** → phone-dependent, no online lead-capture path
- **Phone-only** → every missed call is lost revenue
- **No phone/email** → minimal digital footprint, hard to reach
- **No opening hours** → after-hours calls likely unanswered

Fully offline and free. See `src/painPoints.js`.

## Project structure

```
app/               # Next.js App Router (landing, pricing, dashboard, API routes)
  api/search/      # SSE search endpoint (auth + quota + cache)
  api/billing/     # Paystack checkout
  api/webhooks/    # Paystack webhook (HMAC-verified)
components/        # React components (dashboard, marketing)
lib/               # db (Drizzle), quota, paystack, plans, overpass cache
drizzle/           # generated SQL migrations
proxy.ts           # Clerk auth + optional country gate
src/               # core lead engine (shared by web + CLI, plain ESM JS)
  cli.js           # CLI entry
  runSearch.js     # shared search pipeline
  overpass.js      # Overpass QL builder + fetch (retry, mirrors, optional cache)
  parse.js         # OSM element -> lead record, dedupe
  painPoints.js    # heuristic pain-point + pitch-angle engine
  output.js        # CSV / XLSX writers
server.js          # legacy localhost dashboard (npm run web:legacy)
public/            # legacy dashboard assets
```

## Notes & limitations

- **Coverage varies by area.** OSM is community-maintained; missing fields double as
  pain-point signals.
- **Be polite.** The engine rotates public Overpass mirrors, rate-limits itself, and
  the web app caches responses for 7 days.
- Data is deduplicated within a run (by phone, else name + location).
