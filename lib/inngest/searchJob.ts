import { inngest, SEARCH_REQUESTED } from "./client";
import {
  finishJob,
  heartbeat,
  leadsNeedingDecisionMakers,
  saveDecisionMakers,
  saveStep,
  startJob,
  stepContext,
  type SaveResult,
  type SearchUnit,
} from "../searchJobs";
import { overpassDbCache } from "../overpassCache";
import { notifyUser, type PushPayload } from "../push";
import { findDecisionMakers, hasDecisionMakerLookup } from "../decisionMakers";
import { lookupDecisionMakers, resolveNiches, searchNiche } from "@/src/runSearch.js";
import { stateNameFromIso } from "@/src/usStates.js";

// State/niche pairs searched at once. Overpass mirrors throttle per IP, so keep it small.
const PARALLEL = Math.min(6, Math.max(1, Number(process.env.SEARCH_PARALLEL_NICHES) || 3));
const HEARTBEAT_MS = 20_000;
// Each step must finish well inside Vercel's 300s, scraping included. A statewide
// query takes ~75s upstream, so allow one slow attempt plus a fallback mirror,
// and give up on the niche after two minutes.
const WEB_OVERPASS = { requestTimeoutMs: 90_000, deadlineMs: 120_000, retries: 3 };

async function runUnit(
  searchId: number,
  unit: SearchUnit,
  perNicheLimit: number | null
): Promise<SaveResult> {
  const ctx = await stepContext(searchId);
  if (!ctx) return { saved: 0, stop: true };
  const [niche] = resolveNiches(unit.nicheKey) as { key: string; label: string }[];
  const statusLine = `${stateNameFromIso(unit.stateIso) || unit.stateIso} · ${niche?.label ?? unit.nicheKey}`;
  if (!niche) return saveStep(searchId, [], statusLine);

  let cancelled = false;
  const beat = async () => {
    try {
      cancelled = (await heartbeat(searchId)).cancelled;
    } catch (err) {
      console.error(`[search ${searchId}] heartbeat failed:`, (err as Error).message);
    }
  };
  await beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  try {
    const room = perNicheLimit ? Math.min(ctx.room, perNicheLimit) : ctx.room;
    const { leads } = await searchNiche({
      stateIso: unit.stateIso,
      niche,
      room,
      seen: ctx.seen,
      opts: { cache: overpassDbCache, scrapeContacts: true, overpass: WEB_OVERPASS },
      callbacks: { isCancelled: () => cancelled },
    });
    return await saveStep(searchId, leads, statusLine);
  } catch (err) {
    // One slow or broken niche must not end the search; count the step and move
    // on. Several in a row with every mirror down ends it with a clear message.
    const message = (err as Error).message;
    console.error(`[search ${searchId}] ${unit.stateIso}/${unit.nicheKey} failed:`, message);
    return saveStep(searchId, [], statusLine, { overpassDown: message.startsWith("Overpass unavailable") });
  } finally {
    clearInterval(timer);
  }
}

const RUN_FAILED = "The search hit an error. Please try again.";

interface FinishedSearch {
  id: number;
  userId: number;
  status: string;
  error: string | null;
  saved: number;
}

function toFinished(row: Awaited<ReturnType<typeof finishJob>>): FinishedSearch | null {
  if (!row) return null;
  const saved = Number((row.progress as { saved?: number } | null)?.saved) || 0;
  return { id: row.id, userId: row.userId, status: row.status, error: row.error, saved };
}

// Cancelled searches were stopped by the user, so they get no notification.
function finishedNotification(search: FinishedSearch): PushPayload | null {
  const base = { url: "/app", tag: `search-${search.id}` };
  if (search.status === "completed") {
    const body = search.saved
      ? `${search.saved} new lead${search.saved === 1 ? "" : "s"} added to your CRM.`
      : "No new leads this time. Try other niches or states.";
    return { ...base, title: "Your search is done", body };
  }
  if (search.status === "failed") {
    return { ...base, title: "Your search stopped", body: search.error || RUN_FAILED };
  }
  return null;
}

async function notifyFinished(search: FinishedSearch | null) {
  const payload = search && finishedNotification(search);
  if (!search || !payload) return 0;
  return notifyUser(search.userId, payload);
}

async function runDecisionMakers(searchId: number): Promise<number> {
  const limit = Number(process.env.DECISION_MAKER_MAX_PER_SEARCH) || 25;
  const rows = await leadsNeedingDecisionMakers(searchId, limit);
  if (!rows.length) return 0;
  await lookupDecisionMakers(rows, findDecisionMakers, limit);
  await saveDecisionMakers(rows as Parameters<typeof saveDecisionMakers>[0]);
  return rows.length;
}

export const searchJob = inngest.createFunction(
  {
    id: "run-lead-search",
    triggers: [{ event: SEARCH_REQUESTED }],
    // Limits concurrent steps per user; one search per user is enforced on create.
    concurrency: { key: "event.data.userId", limit: PARALLEL },
    retries: 1,
    onFailure: async ({ event, error }) => {
      const searchId = Number(event.data.event.data?.searchId);
      console.error(`[search ${searchId}] run failed:`, error.message);
      if (!searchId) return;
      const search = toFinished(await finishJob(searchId, RUN_FAILED));
      // finishJob returns the old row when the search had already finished; only announce this failure.
      if (search?.status === "failed" && search.error === RUN_FAILED) await notifyFinished(search);
    },
  },
  async ({ event, step }) => {
    const searchId = Number(event.data.searchId);
    const plan = await step.run("plan", () => startJob(searchId));
    if (!plan) return { searchId, skipped: true };

    let stopped = false;
    for (let i = 0; i < plan.units.length && !stopped; i += PARALLEL) {
      const wave = plan.units.slice(i, i + PARALLEL);
      const results = await Promise.all(
        wave.map((unit, j) =>
          step.run(`niche-${i + j}`, () => runUnit(searchId, unit, plan.perNicheLimit))
        )
      );
      stopped = results.some((r) => r.stop);
    }

    // Finish before the decision-maker pass so the user sees their leads right away.
    const finished = await step.run("finish", async () => toFinished(await finishJob(searchId)));
    const status = finished?.status ?? null;
    // Its own step so a retry of a later step doesn't send it twice.
    await step.run("notify", () => notifyFinished(finished));
    if (status !== "failed" && hasDecisionMakerLookup()) {
      await step.run("decision-makers", () => runDecisionMakers(searchId));
    }
    return { searchId, status };
  }
);
