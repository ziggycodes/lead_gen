import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { isPremiumPlan, type AppUser } from "./users";
import { emailAllowance, getUsage, recordEmailsFound, recordUsage } from "./usage";
import { crmIdsForLeads, logActivity, upsertLeads } from "./leads";
import { leadKey, type LeadLike } from "./leadKey";
import { REGULAR_DAILY_LEADS } from "./plans";
import { filterContactable } from "@/src/contactable.js";
import { admitWithinEmailCap, countEmailLeads } from "@/src/emailCap.js";
import { dedupeKeys } from "@/src/parse.js";
import { planRegularSearch } from "@/src/regularSearch.js";
import { listNicheKeys } from "@/src/niches.js";
import { listStateIsoCodes, stateNameFromIso } from "@/src/usStates.js";
import { resolveNiches, resolveStates } from "@/src/runSearch.js";

type SearchRow = typeof schema.searches.$inferSelect;
type RawLead = Record<string, unknown>;

// A job that has not written a heartbeat in this long is dead (deploy, crash,
// or the queue never picked it up). The worker beats every ~20s while it runs.
export const STALE_MS = 3 * 60 * 1000;
// Inngest caps steps per run, and nobody needs more than this many state/niche pairs.
const MAX_UNITS = 600;
const ACTIVE = ["queued", "running"];

export type SearchStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface SearchParams {
  mode: "regular" | "premium";
  niches: string;
  states: string;
  limit: number;
  perNicheLimit?: number;
  stateLabel?: string | null;
}

export interface SearchProgress {
  step: number;
  totalSteps: number;
  found: number;
  saved: number;
  statusLine: string;
  notice: string | null;
  // Steps in a row where every map mirror was down.
  unavailableStreak?: number;
  // Set when the worker gave up early; finishJob turns it into the job's error.
  abortError?: string | null;
}

export interface SearchUnit {
  stateIso: string;
  nicheKey: string;
}

export interface SearchJobView {
  id: number;
  status: SearchStatus;
  params: SearchParams | null;
  progress: SearchProgress;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export class SearchJobError extends Error {
  status: number;
  searchId: number | null;
  constructor(message: string, status = 400, searchId: number | null = null) {
    super(message);
    this.name = "SearchJobError";
    this.status = status;
    this.searchId = searchId;
  }
}

function emptyProgress(): SearchProgress {
  return { step: 0, totalSteps: 0, found: 0, saved: 0, statusLine: "", notice: null };
}

function readProgress(row: Pick<SearchRow, "progress" | "leadCount">): SearchProgress {
  const p = (row.progress ?? {}) as Partial<SearchProgress>;
  return { ...emptyProgress(), found: row.leadCount, ...p };
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toJobView(row: SearchRow): SearchJobView {
  return {
    id: row.id,
    status: row.status as SearchStatus,
    params: (row.params as SearchParams | null) ?? null,
    progress: readProgress(row),
    error: row.error,
    createdAt: iso(row.createdAt) ?? "",
    completedAt: iso(row.completedAt),
  };
}

// Mark this user's dead jobs failed, so they never block a new search.
export async function markStaleJobs(userId: number): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS);
  await db()
    .update(schema.searches)
    .set({
      status: "failed",
      error: "The search stopped responding.",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.searches.userId, userId),
        inArray(schema.searches.status, ACTIVE),
        sql`coalesce(${schema.searches.heartbeatAt}, ${schema.searches.createdAt}) < ${cutoff}`
      )
    );
}

export async function findJob(userId: number, searchId: number): Promise<SearchRow | null> {
  const row = await db().query.searches.findFirst({
    where: and(eq(schema.searches.id, searchId), eq(schema.searches.userId, userId)),
  });
  return row ?? null;
}

export async function activeJob(userId: number): Promise<SearchRow | null> {
  await markStaleJobs(userId);
  const row = await db().query.searches.findFirst({
    where: and(eq(schema.searches.userId, userId), inArray(schema.searches.status, ACTIVE)),
    orderBy: [desc(schema.searches.createdAt)],
  });
  return row ?? null;
}

// The latest finished job whose result popup the user has not seen yet.
export async function unseenFinishedJob(userId: number): Promise<SearchRow | null> {
  const row = await db().query.searches.findFirst({
    where: and(
      eq(schema.searches.userId, userId),
      inArray(schema.searches.status, ["completed", "failed", "cancelled"]),
      isNull(schema.searches.completionSeenAt),
      isNotNull(schema.searches.completedAt)
    ),
    orderBy: [desc(schema.searches.completedAt)],
  });
  return row ?? null;
}

export async function markJobSeen(userId: number, searchId: number): Promise<void> {
  // Older unseen jobs would otherwise pop up one after another.
  await db()
    .update(schema.searches)
    .set({ completionSeenAt: new Date() })
    .where(
      and(
        eq(schema.searches.userId, userId),
        isNull(schema.searches.completionSeenAt),
        sql`${schema.searches.id} <= ${searchId}`,
        inArray(schema.searches.status, ["completed", "failed", "cancelled"])
      )
    );
}

export async function requestCancel(userId: number, searchId: number): Promise<SearchRow | null> {
  const [row] = await db()
    .update(schema.searches)
    .set({ cancelRequested: true })
    .where(
      and(
        eq(schema.searches.id, searchId),
        eq(schema.searches.userId, userId),
        inArray(schema.searches.status, ACTIVE)
      )
    )
    .returning();
  if (!row) return findJob(userId, searchId);
  // A queued job has no worker yet; end it here so the UI doesn't wait for one.
  if (row.status === "queued") return finishJob(row.id);
  return row;
}

export interface SearchRequest {
  niches?: string;
  states?: string;
  limit?: number;
}

// Validate, then insert a queued job. The caller sends the queue event.
export async function createSearchJob(user: AppUser, input: SearchRequest): Promise<SearchRow> {
  if (user.accountStatus === "flagged") {
    const reason = user.accountNote?.trim();
    throw new SearchJobError(
      reason ? `New searches are paused. Reason: ${reason}` : "New searches are paused.",
      403
    );
  }

  let params: SearchParams;
  if (!isPremiumPlan(user.plan)) {
    const usage = await getUsage(user.id);
    const remaining = REGULAR_DAILY_LEADS - usage.consumedToday;
    if (remaining <= 0) {
      throw new SearchJobError(
        `You've used today's ${REGULAR_DAILY_LEADS} leads. Come back tomorrow for more.`,
        403
      );
    }
    const planned = planRegularSearch({
      nicheKeys: listNicheKeys(),
      stateCodes: listStateIsoCodes(),
      remaining,
    });
    if (!planned.state || planned.niches.length === 0) {
      throw new SearchJobError("No places are available to search.", 500);
    }
    params = {
      mode: "regular",
      niches: planned.niches.join(","),
      states: planned.state,
      limit: planned.limit,
      perNicheLimit: planned.perNicheLimit,
      stateLabel: stateNameFromIso(planned.state) || planned.state,
    };
  } else {
    const niches = (input.niches || "").trim();
    if (!niches) throw new SearchJobError("Pick at least one niche.");
    const limit = Math.floor(Number(input.limit));
    params = {
      mode: "premium",
      niches,
      states: (input.states || "US").trim() || "US",
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 5000) : 50,
    };
  }

  const allowance = await emailAllowance(user.id, user.emailDailyLimit);
  if (allowance.remaining === 0) {
    throw new SearchJobError(`You've reached today's email limit (${allowance.limit}).`, 403);
  }

  const running = await activeJob(user.id);
  if (running) {
    throw new SearchJobError("You already have a search running.", 409, running.id);
  }

  const [row] = await db()
    .insert(schema.searches)
    .values({
      userId: user.id,
      status: "queued",
      params,
      heartbeatAt: new Date(),
      progress: {
        ...emptyProgress(),
        statusLine: params.stateLabel
          ? `A mix of businesses in ${params.stateLabel}.`
          : "Waiting to start…",
      },
    })
    .returning();
  return row;
}

// ---- Worker side (called from the Inngest function) ----

export interface JobPlan {
  units: SearchUnit[];
  limit: number;
  perNicheLimit: number | null;
}

// Claim a queued job and expand it into state/niche units. Null means skip it.
export async function startJob(searchId: number): Promise<JobPlan | null> {
  const [row] = await db()
    .update(schema.searches)
    .set({ status: "running", heartbeatAt: new Date() })
    .where(and(eq(schema.searches.id, searchId), inArray(schema.searches.status, ACTIVE)))
    .returning();
  if (!row) return null;
  if (row.cancelRequested) {
    await finishJob(searchId);
    return null;
  }

  const params = row.params as SearchParams;
  const niches = resolveNiches(params.niches) as { key: string }[];
  const states = resolveStates(params.states) as string[];
  const units: SearchUnit[] = [];
  for (const stateIso of states) {
    for (const niche of niches) units.push({ stateIso, nicheKey: niche.key });
  }
  const capped = units.slice(0, MAX_UNITS);
  if (!capped.length) {
    await finishJob(searchId, "No valid niches or states to search.");
    return null;
  }

  const progress = readProgress(row);
  await db()
    .update(schema.searches)
    .set({ progress: { ...progress, totalSteps: capped.length } })
    .where(eq(schema.searches.id, searchId));

  return {
    units: capped,
    limit: params.limit,
    perNicheLimit: params.perNicheLimit ?? null,
  };
}

export interface StepContext {
  userId: number;
  room: number;
  seen: Set<string>;
}

// Null when the job should stop (cancelled, finished elsewhere, or full).
export async function stepContext(searchId: number): Promise<StepContext | null> {
  const row = await db().query.searches.findFirst({ where: eq(schema.searches.id, searchId) });
  if (!row || row.status !== "running" || row.cancelRequested) return null;
  const params = row.params as SearchParams;
  const progress = readProgress(row);
  let room = params.limit - progress.saved;
  if (params.mode === "regular") {
    const usage = await getUsage(row.userId);
    room = Math.min(room, REGULAR_DAILY_LEADS - usage.consumedToday);
  }
  if (room <= 0) return null;
  return {
    userId: row.userId,
    room,
    seen: new Set(Array.isArray(row.seenKeys) ? (row.seenKeys as string[]) : []),
  };
}

export async function heartbeat(searchId: number): Promise<{ cancelled: boolean }> {
  const [row] = await db()
    .update(schema.searches)
    .set({ heartbeatAt: new Date() })
    .where(eq(schema.searches.id, searchId))
    .returning({ status: schema.searches.status, cancelRequested: schema.searches.cancelRequested });
  return { cancelled: !row || row.status !== "running" || row.cancelRequested };
}

export interface SaveResult {
  saved: number;
  stop: boolean;
}

// Namespace for pg_advisory_xact_lock(ns, searchId), so search locks can't
// collide with any other advisory lock.
const SAVE_LOCK_NS = 7301;
// Steps in a row that found every map mirror down before the search gives up.
const OUTAGE_STREAK = 3;
export const OUTAGE_MESSAGE =
  "The map data service is down right now, so no businesses could be looked up. Please try again in a few minutes.";

// Save one unit's leads into the CRM. An advisory lock on the search id runs
// saves one at a time, so the daily cap, the job limit, and cross-step dedupe
// stay exact. Everything inside uses the transaction's own connection: a save
// never waits on the pool while it holds the lock. Heartbeats and status reads
// don't take that lock, so they never queue behind a save.
export async function saveStep(
  searchId: number,
  leads: RawLead[],
  statusLine: string,
  opts: { overpassDown?: boolean } = {}
): Promise<SaveResult> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SAVE_LOCK_NS}, ${searchId})`);
    const row = await tx.query.searches.findFirst({ where: eq(schema.searches.id, searchId) });
    if (!row || row.status !== "running") return { saved: 0, stop: true };

    const params = row.params as SearchParams;
    const progress = readProgress(row);
    const seen = new Set(Array.isArray(row.seenKeys) ? (row.seenKeys as string[]) : []);
    const user = await tx.query.users.findFirst({
      where: eq(schema.users.id, row.userId),
      columns: { emailDailyLimit: true },
    });

    // Another step may have claimed the same business since this one read `seen`.
    const fresh: RawLead[] = [];
    for (const lead of filterContactable(leads) as RawLead[]) {
      const keys = dedupeKeys(lead) as string[];
      if (keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
      fresh.push(lead);
    }

    let room = params.limit - progress.saved;
    let dailyLeft = Infinity;
    if (params.mode === "regular") {
      const usage = await getUsage(row.userId, tx);
      dailyLeft = REGULAR_DAILY_LEADS - usage.consumedToday;
      room = Math.min(room, dailyLeft);
    }

    // Businesses already in the CRM still get their blanks filled, but only new
    // ones count toward the job limit, the daily cap, and the email cap.
    const existing = await crmIdsForLeads(row.userId, fresh, tx);
    const known = fresh.filter((l) => existing.has(leadKey(l as LeadLike)));
    const candidates = fresh.filter((l) => !existing.has(leadKey(l as LeadLike)));
    const allowance = await emailAllowance(row.userId, user?.emailDailyLimit ?? null, tx);
    const admitted = admitWithinEmailCap(candidates.slice(0, Math.max(0, room)), allowance.remaining, 0);
    const newLeads = admitted.keep as RawLead[];

    let inserted = 0;
    const toSave = [...newLeads, ...known];
    if (toSave.length) {
      const result = await upsertLeads(
        row.userId,
        toSave,
        { sourceSearchId: searchId, via: "search" },
        tx
      );
      inserted = result.inserted;
      await recordUsage(row.userId, inserted, tx);
      await recordEmailsFound(row.userId, countEmailLeads(newLeads), tx);
    }

    const unavailableStreak = opts.overpassDown ? (progress.unavailableStreak ?? 0) + 1 : 0;
    const outage = unavailableStreak >= OUTAGE_STREAK;
    const saved = progress.saved + inserted;
    const notice = admitted.capped
      ? `This search stopped because you reached today's email limit of ${allowance.limit}.`
      : progress.notice;
    const stop =
      outage ||
      admitted.capped ||
      saved >= params.limit ||
      dailyLeft - inserted <= 0 ||
      row.cancelRequested;

    const blob = Array.isArray(row.resultBlob) ? (row.resultBlob as RawLead[]) : [];
    await tx
      .update(schema.searches)
      .set({
        seenKeys: [...seen],
        resultBlob: [...blob, ...toSave],
        leadCount: row.leadCount + toSave.length,
        heartbeatAt: new Date(),
        progress: {
          ...progress,
          step: progress.step + 1,
          found: row.leadCount + toSave.length,
          saved,
          statusLine,
          notice,
          unavailableStreak,
          abortError: outage ? OUTAGE_MESSAGE : (progress.abortError ?? null),
        },
      })
      .where(eq(schema.searches.id, searchId));

    return { saved: inserted, stop };
  });
}

// Close the job. Cancelled if the user asked, failed if `error` (or the worker
// gave up early, e.g. the map service was down), else completed.
export async function finishJob(searchId: number, failure?: string): Promise<SearchRow | null> {
  const row = await db().query.searches.findFirst({ where: eq(schema.searches.id, searchId) });
  if (!row || !ACTIVE.includes(row.status)) return row ?? null;
  const progress = readProgress(row);
  const error = failure ?? progress.abortError ?? undefined;
  const status: SearchStatus = row.cancelRequested ? "cancelled" : error ? "failed" : "completed";
  const [updated] = await db()
    .update(schema.searches)
    .set({
      status,
      error: error ?? null,
      completedAt: new Date(),
      progress: { ...progress, statusLine: "" },
    })
    .where(and(eq(schema.searches.id, searchId), inArray(schema.searches.status, ACTIVE)))
    .returning();
  return updated ?? row;
}

// Leads this search added that still need a decision-maker lookup.
export async function leadsNeedingDecisionMakers(searchId: number, limit: number) {
  return db()
    .select({
      id: schema.leads.id,
      userId: schema.leads.userId,
      name: schema.leads.name,
      city: schema.leads.city,
      state: schema.leads.state,
      website: schema.leads.website,
      phone: schema.leads.phone,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.sourceSearchId, searchId), isNull(schema.leads.decisionMakerStatus)))
    .limit(limit);
}

export async function saveDecisionMakers(
  rows: { id: number; userId: number; decisionMakers?: unknown[]; decisionMakerStatus?: string }[]
): Promise<void> {
  for (const row of rows) {
    if (!row.decisionMakerStatus) continue;
    await db()
      .update(schema.leads)
      .set({
        decisionMakers: row.decisionMakerStatus === "error" ? null : row.decisionMakers ?? [],
        decisionMakerStatus: row.decisionMakerStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.leads.id, row.id), isNull(schema.leads.decisionMakerStatus)));
    if (row.decisionMakerStatus === "found") {
      await logActivity(row.userId, [row.id], "decision_makers_found", {
        count: row.decisionMakers?.length ?? 0,
      });
    }
  }
}
