# LeadScout

**Find US business leads and manage them in a lightweight CRM.**

LeadScout is a hosted SaaS (Next.js) plus a CLI that collects US business leads,
scrapes contact details from each business's website, and exports everything to CSV or Excel.

- **Web app** — sign up and manage every lead in your account's CRM (statuses, notes, follow-ups, activity).
- **CLI** — the original free power-user tool.

## CRM

Each account has its own lead pipeline at `/app`:

- **Leads tab** — summary cards per stage, filters (status, niche, state, source
  search, has email/phone, saved, follow-ups due), sortable table with inline status
  changes, bulk status/save/export/delete.
- **Lead drawer** — edit contact details, set status and a follow-up date, save/star,
  add notes, look up decision makers, and see the full activity timeline.
- **Find leads tab** — the search flow. Results are upserted into the CRM (deduped by
  name + city + state), so re-running a search never duplicates leads and never
  overwrites details you edited by hand.
- Pipeline stages: New, Contacted, Replied, Qualified, Won, Lost, Not interested
  (`lib/crm.ts`).
- On first load after upgrading, past search results and starred leads are imported
  into the CRM once (`backfillLegacyLeads` in `lib/leads.ts`).

## Deferred: business email and outreach (Zoho)

Not built yet; the CRM comes first. Notes for when this becomes a priority:

- The plan is to buy a domain-based business email, likely **Zoho Mail**, and connect
  that mailbox so emails can be sent from LeadScout.
- Outside the IDE: buy the Zoho Mail plan, connect the domain, and add the DNS records
  Zoho gives you (MX, SPF, DKIM, DMARC).
- Fastest integration: Zoho (or any provider) **SMTP + IMAP** with an app-specific
  password, stored encrypted. Send over SMTP; sync replies over IMAP.
- More polished later: **Zoho OAuth / Mail API** — needs a Zoho developer app,
  redirect URLs, token refresh, and encrypted token storage.
- Data model to add then: provider-agnostic `email_accounts`, plus `email_templates`,
  `campaigns`, `campaign_recipients`, `email_messages`, and `suppression_list`. Sends
  and replies should write to `lead_activities` and move leads to Contacted/Replied.
- Bulk sending needs a rate-limited worker/queue and unsubscribe/suppression handling
  before it goes live.

## What you get per lead

| Column | Description |
| --- | --- |
| Business Name | Name of the business |
| Niche | Friendly niche label (e.g. "Dental Practice") |
| State / City | City and state for the business |
| Phone / Website / Email | Public contact info, plus emails scraped from the website |
| Address | Best-effort full street address |
| Decision Maker | Top LinkedIn match (when SerpApi is configured) |

CRM exports also include Status, Saved, Contact Name, and Follow Up.

## Web app (the SaaS)

### Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Clerk** — authentication (free tier; runs keyless in dev)
- **Postgres + Drizzle** — users, usage/quota, searches, CRM leads/notes/activity, Overpass cache (free tier: Neon/Supabase)
- **Paystack** — NGN credit-pack payments (test keys in dev)

### Business rules

- Every account gets **50 free leads** (lifetime trial).
- **1,000 leads/day** fair-use cap for all accounts.
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
| `--no-enrich` | off | Skip auto ratings enrichment even if `SERPAPI_KEY` is set |

The legacy localhost dashboard is still available via `npm run web:legacy`.

### Optional enrichment (CLI only for now)

With `SERPAPI_KEY` in `.env`, the CLI adds Google ratings and review counts. The web
app keeps ratings off (SerpApi bills in USD, which doesn't fit the NGN price points)
but uses the same key for decision-maker lookups.

## Project structure

```
app/               # Next.js App Router (landing, dashboard, API routes)
  api/search/      # SSE search endpoint (auth + quota + cache), upserts into the CRM
  api/leads/       # CRM: list, bulk update/delete, per-lead detail, notes, export
  api/billing/     # Paystack checkout
  api/webhooks/    # Paystack webhook (HMAC-verified)
components/        # React components (dashboard, marketing)
lib/               # db (Drizzle), CRM (crm.ts, leads.ts), quota, paystack, plans, overpass cache
drizzle/           # generated SQL migrations
proxy.ts           # Clerk auth + optional country gate
src/               # core lead engine (shared by web + CLI, plain ESM JS)
  cli.js           # CLI entry
  runSearch.js     # shared search pipeline
  overpass.js      # Overpass QL builder + fetch (retry, mirrors, optional cache)
  parse.js         # raw result -> lead record, dedupe
  output.js        # CSV / XLSX writers
server.js          # legacy localhost dashboard (npm run web:legacy)
public/            # legacy dashboard assets
```

## Notes & limitations

- **Coverage varies by area.** Some leads will be missing phone, website, or email.
- **Be polite.** The engine rotates public Overpass mirrors, rate-limits itself, and
  the web app caches responses for 7 days.
- Data is deduplicated within a run (by phone, else name + location).
