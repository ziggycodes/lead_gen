import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { listAdminActions, type AdminActionEntry } from "./adminAudit";
import { STALE_MS, type SearchParams } from "./searchJobs";

export type StatsRange = 7 | 30;

export interface Metric {
  current: number;
  previous: number;
}

export interface DailyPoint {
  day: string;
  signups: number;
  searches: number;
}

export interface AttentionItem {
  kind: "stuck_search" | "failed_search" | "at_email_cap" | "flagged";
  label: string;
  detail: string;
  userId: number | null;
  searchId: number | null;
}

export interface OverviewStats {
  range: StatsRange;
  signups: Metric;
  activeUsers: Metric;
  searches: Metric;
  failedSearches: Metric;
  leadsFound: Metric;
  revenueNgn: Metric;
  payingUsers: Metric;
  medianSearchSeconds: number | null;
  emailsFoundToday: number;
  totalUsers: number;
  daily: DailyPoint[];
  attention: AttentionItem[];
}

export type AdminSearchStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "stuck";

export interface AdminSearchRow {
  id: number;
  userId: number;
  userLabel: string;
  status: AdminSearchStatus;
  mode: string | null;
  niches: string | null;
  states: string | null;
  limit: number | null;
  leadCount: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
}

export interface AccountDetail {
  searches: AdminSearchRow[];
  payments: { id: number; amountNgn: number; credits: number; status: string; createdAt: string }[];
  notices: { id: number; kind: string; body: string; createdAt: string; readAt: string | null }[];
  actions: AdminActionEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE = ["queued", "running"];

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function metric(row: Record<string, unknown>, key: string): Metric {
  return { current: num(row[`${key}_cur`]), previous: num(row[`${key}_prev`]) };
}

export function parseRange(value: string | null | undefined): StatsRange {
  return value === "7d" || value === "7" ? 7 : 30;
}

export async function overviewStats(range: StatsRange): Promise<OverviewStats> {
  const now = new Date();
  const start = new Date(now.getTime() - range * DAY_MS);
  const prevStart = new Date(now.getTime() - 2 * range * DAY_MS);
  const today = now.toISOString().slice(0, 10);

  const [userRes, searchRes, payRes, usageRes, dailyRes, attention] = await Promise.all([
    db().execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where created_at >= ${start})::int as signups_cur,
        count(*) filter (where created_at >= ${prevStart} and created_at < ${start})::int as signups_prev
      from users`),
    db().execute(sql`
      select
        count(*) filter (where created_at >= ${start})::int as searches_cur,
        count(*) filter (where created_at >= ${prevStart} and created_at < ${start})::int as searches_prev,
        count(*) filter (where status = 'failed' and created_at >= ${start})::int as failed_cur,
        count(*) filter (where status = 'failed' and created_at >= ${prevStart} and created_at < ${start})::int as failed_prev,
        count(distinct user_id) filter (where created_at >= ${start})::int as active_cur,
        count(distinct user_id) filter (where created_at >= ${prevStart} and created_at < ${start})::int as active_prev,
        coalesce(sum(lead_count) filter (where created_at >= ${start}), 0)::int as leads_cur,
        coalesce(sum(lead_count) filter (where created_at >= ${prevStart} and created_at < ${start}), 0)::int as leads_prev,
        percentile_cont(0.5) within group (order by extract(epoch from completed_at - created_at))
          filter (where status = 'completed' and completed_at is not null and created_at >= ${start}) as median_seconds
      from searches
      where created_at >= ${prevStart}`),
    db().execute(sql`
      select
        coalesce(sum(amount_kobo) filter (where coalesce(paid_at, created_at) >= ${start}), 0)::bigint as revenue_cur,
        coalesce(sum(amount_kobo) filter (where coalesce(paid_at, created_at) >= ${prevStart} and coalesce(paid_at, created_at) < ${start}), 0)::bigint as revenue_prev,
        count(distinct user_id) filter (where coalesce(paid_at, created_at) >= ${start})::int as paying_cur,
        count(distinct user_id) filter (where coalesce(paid_at, created_at) >= ${prevStart} and coalesce(paid_at, created_at) < ${start})::int as paying_prev
      from payments
      where status = 'success'`),
    db().execute(sql`
      select coalesce(sum(emails_found_today), 0)::int as emails_today
      from usage
      where emails_found_on = ${today}`),
    db().execute(sql`
      with days as (
        select generate_series(
          date_trunc('day', ${now}::timestamptz at time zone 'UTC') - make_interval(days => ${range - 1}),
          date_trunc('day', ${now}::timestamptz at time zone 'UTC'),
          interval '1 day'
        )::date as day
      )
      select
        to_char(days.day, 'YYYY-MM-DD') as day,
        (select count(*)::int from users u where (u.created_at at time zone 'UTC')::date = days.day) as signups,
        (select count(*)::int from searches s where (s.created_at at time zone 'UTC')::date = days.day) as searches
      from days
      order by days.day`),
    attentionItems(today),
  ]);

  const users = userRes.rows[0] ?? {};
  const searches = searchRes.rows[0] ?? {};
  const pay = payRes.rows[0] ?? {};
  const median = searches.median_seconds;

  return {
    range,
    signups: metric(users, "signups"),
    activeUsers: metric(searches, "active"),
    searches: metric(searches, "searches"),
    failedSearches: metric(searches, "failed"),
    leadsFound: metric(searches, "leads"),
    revenueNgn: { current: num(pay.revenue_cur) / 100, previous: num(pay.revenue_prev) / 100 },
    payingUsers: metric(pay, "paying"),
    medianSearchSeconds: median == null ? null : Math.round(num(median)),
    emailsFoundToday: num(usageRes.rows[0]?.emails_today),
    totalUsers: num(users.total),
    daily: dailyRes.rows.map((row) => ({
      day: String(row.day),
      signups: num(row.signups),
      searches: num(row.searches),
    })),
    attention,
  };
}

async function attentionItems(today: string): Promise<AttentionItem[]> {
  const staleCutoff = new Date(Date.now() - STALE_MS);
  const failedSince = new Date(Date.now() - DAY_MS);

  const [stuck, failed, capped, flagged] = await Promise.all([
    db().execute(sql`
      select s.id, s.user_id, coalesce(u.name, u.email, 'Unknown user') as label,
        coalesce(s.heartbeat_at, s.created_at) as last_beat
      from searches s join users u on u.id = s.user_id
      where s.status in ('queued', 'running')
        and coalesce(s.heartbeat_at, s.created_at) < ${staleCutoff}
      order by s.created_at desc
      limit 10`),
    db().execute(sql`
      select s.id, s.user_id, coalesce(u.name, u.email, 'Unknown user') as label, s.error
      from searches s join users u on u.id = s.user_id
      where s.status = 'failed' and s.created_at >= ${failedSince}
      order by s.created_at desc
      limit 10`),
    db().execute(sql`
      select u.id, coalesce(u.name, u.email, 'Unknown user') as label, u.email_daily_limit
      from users u join usage g on g.user_id = u.id
      where u.email_daily_limit is not null
        and g.emails_found_on = ${today}
        and g.emails_found_today >= u.email_daily_limit
      limit 10`),
    db().execute(sql`
      select u.id, coalesce(u.name, u.email, 'Unknown user') as label, u.account_note
      from users u
      where u.account_status = 'flagged'
      order by u.created_at desc
      limit 10`),
  ]);

  return [
    ...stuck.rows.map((row) => ({
      kind: "stuck_search" as const,
      label: String(row.label),
      detail: `Search #${row.id} stopped responding`,
      userId: num(row.user_id),
      searchId: num(row.id),
    })),
    ...failed.rows.map((row) => ({
      kind: "failed_search" as const,
      label: String(row.label),
      detail: `Search #${row.id} failed${row.error ? `: ${String(row.error).slice(0, 120)}` : ""}`,
      userId: num(row.user_id),
      searchId: num(row.id),
    })),
    ...capped.rows.map((row) => ({
      kind: "at_email_cap" as const,
      label: String(row.label),
      detail: `Hit the daily cap of ${row.email_daily_limit} emails`,
      userId: num(row.id),
      searchId: null,
    })),
    ...flagged.rows.map((row) => ({
      kind: "flagged" as const,
      label: String(row.label),
      detail: row.account_note ? `Flagged: ${String(row.account_note).slice(0, 120)}` : "Flagged",
      userId: num(row.id),
      searchId: null,
    })),
  ];
}

function isStale(status: string, heartbeatAt: Date | null, createdAt: Date): boolean {
  if (!ACTIVE.includes(status)) return false;
  const beat = heartbeatAt ?? createdAt;
  return beat.getTime() < Date.now() - STALE_MS;
}

const searchSelect = {
  id: schema.searches.id,
  userId: schema.searches.userId,
  userLabel: sql<string>`coalesce(${schema.users.name}, ${schema.users.email}, 'Unknown user')`,
  status: schema.searches.status,
  params: schema.searches.params,
  leadCount: schema.searches.leadCount,
  error: schema.searches.error,
  createdAt: schema.searches.createdAt,
  completedAt: schema.searches.completedAt,
  heartbeatAt: schema.searches.heartbeatAt,
};

type SearchSelectRow = {
  id: number;
  userId: number;
  userLabel: string;
  status: string;
  params: unknown;
  leadCount: number;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  heartbeatAt: Date | null;
};

// A dead job is only marked failed when someone next polls, which can be days
// later, so its run ends at the last heartbeat rather than at completedAt.
// Failed jobs from before heartbeats existed have no reliable end at all.
function runEnd(row: SearchSelectRow): Date | null {
  if (!row.completedAt) return null;
  if (row.status !== "failed") return row.completedAt;
  if (!row.heartbeatAt) return null;
  return row.heartbeatAt < row.completedAt ? row.heartbeatAt : row.completedAt;
}

function toSearchRow(row: SearchSelectRow): AdminSearchRow {
  const params = (row.params as SearchParams | null) ?? null;
  const stale = isStale(row.status, row.heartbeatAt, row.createdAt);
  const end = runEnd(row);
  return {
    id: row.id,
    userId: row.userId,
    userLabel: row.userLabel,
    status: stale ? "stuck" : (row.status as AdminSearchStatus),
    mode: params?.mode ?? null,
    niches: params?.niches ?? null,
    states: params?.stateLabel || params?.states || null,
    limit: params?.limit ?? null,
    leadCount: row.leadCount,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    completedAt: iso(row.completedAt),
    durationSeconds: end ? Math.max(0, Math.round((end.getTime() - row.createdAt.getTime()) / 1000)) : null,
  };
}

// Newest first. `before` is the id of the last row the caller already has.
export async function listAdminSearches(opts: {
  status?: AdminSearchStatus | null;
  userId?: number;
  before?: number;
  limit?: number;
}): Promise<AdminSearchRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const staleCutoff = new Date(Date.now() - STALE_MS);
  const filters = [];
  if (opts.userId) filters.push(eq(schema.searches.userId, opts.userId));
  if (opts.before) filters.push(lt(schema.searches.id, opts.before));
  if (opts.status === "stuck") {
    filters.push(inArray(schema.searches.status, ACTIVE));
    filters.push(sql`coalesce(${schema.searches.heartbeatAt}, ${schema.searches.createdAt}) < ${staleCutoff}`);
  } else if (opts.status === "queued" || opts.status === "running") {
    filters.push(eq(schema.searches.status, opts.status));
    filters.push(sql`coalesce(${schema.searches.heartbeatAt}, ${schema.searches.createdAt}) >= ${staleCutoff}`);
  } else if (opts.status) {
    filters.push(eq(schema.searches.status, opts.status));
  }

  const rows = await db()
    .select(searchSelect)
    .from(schema.searches)
    .innerJoin(schema.users, eq(schema.users.id, schema.searches.userId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.searches.id))
    .limit(limit);
  return rows.map(toSearchRow);
}

export async function findAdminSearch(searchId: number): Promise<AdminSearchRow | null> {
  const [row] = await db()
    .select(searchSelect)
    .from(schema.searches)
    .innerJoin(schema.users, eq(schema.users.id, schema.searches.userId))
    .where(eq(schema.searches.id, searchId))
    .limit(1);
  return row ? toSearchRow(row) : null;
}

export async function accountDetail(userId: number): Promise<AccountDetail> {
  const [searches, payments, notices, actions] = await Promise.all([
    listAdminSearches({ userId, limit: 10 }),
    db()
      .select({
        id: schema.payments.id,
        amountKobo: schema.payments.amountKobo,
        credits: schema.payments.credits,
        status: schema.payments.status,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .where(eq(schema.payments.userId, userId))
      .orderBy(desc(schema.payments.createdAt))
      .limit(10),
    db()
      .select({
        id: schema.accountNotices.id,
        kind: schema.accountNotices.kind,
        body: schema.accountNotices.body,
        createdAt: schema.accountNotices.createdAt,
        readAt: schema.accountNotices.readAt,
      })
      .from(schema.accountNotices)
      .where(eq(schema.accountNotices.userId, userId))
      .orderBy(desc(schema.accountNotices.createdAt))
      .limit(20),
    listAdminActions({ targetUserId: userId, limit: 20 }),
  ]);

  return {
    searches,
    payments: payments.map((row) => ({
      id: row.id,
      amountNgn: row.amountKobo / 100,
      credits: row.credits,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })),
    notices: notices.map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      readAt: iso(row.readAt),
    })),
    actions,
  };
}
