import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "./db";
import { leadKey, type LeadLike } from "./leadKey";
import { isContactable } from "@/src/contactable.js";
import { dedupeKeys } from "@/src/parse.js";

type RawLead = Record<string, unknown>;
type LeadRow = typeof schema.leads.$inferSelect;
type LeadInsert = typeof schema.leads.$inferInsert;

// Raw scraper fields that map onto real columns, or that are legacy/noisy and
// shouldn't be carried into `extra`.
const NON_EXTRA_FIELDS = new Set([
  "name",
  "niche",
  "nicheKey",
  "state",
  "city",
  "address",
  "phone",
  "email",
  "website",
  "osmLink",
  "decisionMakers",
  "decisionMakerStatus",
  "_tags",
  "_key",
  "_crmId",
  "painPoint",
  "pitchAngle",
  "signals",
  "painPointHeuristic",
  "pitchAngleHeuristic",
  "llmEnriched",
  "llmProvider",
]);

const UPSERT_CHUNK = 500;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toInsert(userId: number, raw: RawLead, sourceSearchId: number | null): LeadInsert | null {
  if (!isContactable(raw)) return null;
  const key = leadKey(raw as LeadLike);
  if (!key.replace(/\|/g, "")) return null;

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (NON_EXTRA_FIELDS.has(k) || v === undefined || v === null || v === "") continue;
    extra[k] = v;
  }

  return {
    userId,
    leadKey: key,
    name: str(raw.name) || "Unnamed business",
    niche: str(raw.niche),
    nicheKey: str(raw.nicheKey),
    state: str(raw.state),
    city: str(raw.city),
    address: str(raw.address),
    phone: str(raw.phone),
    email: str(raw.email),
    website: str(raw.website),
    osmLink: str(raw.osmLink),
    decisionMakers: Array.isArray(raw.decisionMakers) ? raw.decisionMakers : null,
    decisionMakerStatus: str(raw.decisionMakerStatus) || null,
    extra: Object.keys(extra).length ? extra : null,
    sourceSearchId,
  };
}

// Keep the richer value when the same business appears twice in one batch;
// Postgres rejects an upsert that touches the same row twice.
function mergeInserts(a: LeadInsert, b: LeadInsert): LeadInsert {
  return {
    ...a,
    phone: a.phone || b.phone,
    email: a.email || b.email,
    website: a.website || b.website,
    address: a.address || b.address,
    decisionMakers: a.decisionMakers ?? b.decisionMakers,
    decisionMakerStatus: a.decisionMakerStatus ?? b.decisionMakerStatus,
    extra: a.extra || b.extra ? { ...(b.extra as object), ...(a.extra as object) } : null,
  };
}

// Fill a column from the incoming row only when the stored value is blank, so
// a re-scrape never overwrites something the user edited by hand.
const fillBlank = (col: string) =>
  sql.raw(`case when "leads"."${col}" = '' then excluded."${col}" else "leads"."${col}" end`);

export interface UpsertResult {
  inserted: number;
  updated: number;
  idsByKey: Map<string, number>;
}

type ExistingMatch = { id: number; leadKey: string };

function sqlList(values: string[]) {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  );
}

// Same location string dedupeKeys builds, so a stored row matches a new lead
// whose name, city, and state agree after trimming and collapsing spaces.
const locationExpr = sql`lower(regexp_replace(btrim(${schema.leads.name}), '[[:space:]]+', ' ', 'g')) || '|' || lower(regexp_replace(btrim(${schema.leads.city}), '[[:space:]]+', ' ', 'g')) || '|' || lower(regexp_replace(btrim(${schema.leads.state}), '[[:space:]]+', ' ', 'g'))`;

// Earliest stored row for each email, phone, and location key in this batch.
async function loadExistingMatches(userId: number, leads: unknown[]): Promise<Map<string, ExistingMatch>> {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const locations = new Set<string>();
  const wanted = new Set<string>();
  for (const lead of leads) {
    for (const key of dedupeKeys(lead)) {
      wanted.add(key);
      if (key.startsWith("e:")) emails.add(key.slice(2));
      else if (key.startsWith("p:")) phones.add(key.slice(2));
      else if (key.startsWith("l:")) locations.add(key.slice(2));
    }
  }

  const clauses: SQL[] = [];
  if (emails.size) clauses.push(sql`lower(btrim(${schema.leads.email})) in (${sqlList([...emails])})`);
  if (phones.size) {
    clauses.push(
      sql`regexp_replace(${schema.leads.phone}, '[^0-9]', '', 'g') in (${sqlList([...phones])})`
    );
  }
  if (locations.size) clauses.push(sql`${locationExpr} in (${sqlList([...locations])})`);
  if (!clauses.length) return new Map();

  const found = await db()
    .select({
      id: schema.leads.id,
      leadKey: schema.leads.leadKey,
      email: schema.leads.email,
      phone: schema.leads.phone,
      name: schema.leads.name,
      city: schema.leads.city,
      state: schema.leads.state,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.userId, userId), clauses.length === 1 ? clauses[0] : or(...clauses)));

  const best = new Map<string, ExistingMatch>();
  for (const row of found) {
    for (const key of dedupeKeys(row)) {
      if (!wanted.has(key)) continue;
      const prev = best.get(key);
      if (!prev || row.id < prev.id) best.set(key, { id: row.id, leadKey: row.leadKey });
    }
  }
  return best;
}

function earliestMatch(lead: unknown, matches: Map<string, ExistingMatch>): ExistingMatch | null {
  let best: ExistingMatch | null = null;
  for (const key of dedupeKeys(lead)) {
    const found = matches.get(key);
    if (found && (!best || found.id < best.id)) best = found;
  }
  return best;
}

// Fold a batch onto shared email, phone, or location keys. The first row keeps
// its leadKey. `aliases` records every incoming key that landed on that row so
// callers can still look a lead up by the OpenStreetMap link it arrived with.
function foldByIdentity(rows: LeadInsert[], aliases: Map<string, Set<string>>): LeadInsert[] {
  const byIdentity = new Map<string, LeadInsert>();
  const out: LeadInsert[] = [];
  const remember = (leadKey: string, alias: string) => {
    if (!leadKey || !alias) return;
    let set = aliases.get(leadKey);
    if (!set) {
      set = new Set();
      aliases.set(leadKey, set);
    }
    set.add(alias);
  };
  const moveAliases = (fromKey: string, toKey: string) => {
    remember(toKey, fromKey);
    const set = aliases.get(fromKey);
    if (!set) return;
    for (const alias of set) remember(toKey, alias);
    if (fromKey !== toKey) aliases.delete(fromKey);
  };

  for (const row of rows) {
    remember(row.leadKey, row.leadKey);
    const keys = dedupeKeys(row);
    const prev = keys.map((key) => byIdentity.get(key)).find((found) => found);
    if (prev) {
      const targetKey = prev.leadKey;
      Object.assign(prev, mergeInserts(prev, row));
      moveAliases(row.leadKey, targetKey);
      for (const key of dedupeKeys(prev)) byIdentity.set(key, prev);
      continue;
    }
    out.push(row);
    for (const key of keys) byIdentity.set(key, row);
  }
  return out;
}

export async function upsertLeads(
  userId: number,
  rawLeads: unknown[],
  opts: { sourceSearchId?: number | null; saved?: boolean; via?: string } = {}
): Promise<UpsertResult> {
  const pending: LeadInsert[] = [];
  for (const raw of rawLeads) {
    if (!raw || typeof raw !== "object") continue;
    const row = toInsert(userId, raw as RawLead, opts.sourceSearchId ?? null);
    if (!row) continue;
    pending.push(row);
  }

  const aliases = new Map<string, Set<string>>();
  let folded = foldByIdentity(pending, aliases);
  const matches = await loadExistingMatches(userId, folded);
  for (const row of folded) {
    const existing = earliestMatch(row, matches);
    if (!existing || existing.leadKey === row.leadKey) continue;
    const previous = row.leadKey;
    row.leadKey = existing.leadKey;
    const set = aliases.get(previous);
    if (set) {
      let dest = aliases.get(existing.leadKey);
      if (!dest) {
        dest = new Set();
        aliases.set(existing.leadKey, dest);
      }
      for (const alias of set) dest.add(alias);
      dest.add(previous);
      aliases.delete(previous);
    }
  }
  const byLeadKey = new Map<string, LeadInsert>();
  const unique: LeadInsert[] = [];
  for (const row of folded) {
    const prev = byLeadKey.get(row.leadKey);
    if (!prev) {
      byLeadKey.set(row.leadKey, row);
      unique.push(row);
      continue;
    }
    Object.assign(prev, mergeInserts(prev, row));
  }
  folded = unique;

  const result: UpsertResult = { inserted: 0, updated: 0, idsByKey: new Map() };
  const rows = folded.map((r) => ({ ...r, saved: Boolean(opts.saved) }));

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const returned = await db()
      .insert(schema.leads)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.leads.userId, schema.leads.leadKey],
        set: {
          phone: fillBlank("phone"),
          email: fillBlank("email"),
          website: fillBlank("website"),
          address: fillBlank("address"),
          decisionMakers: sql`coalesce(${schema.leads.decisionMakers}, excluded.decision_makers)`,
          decisionMakerStatus: sql`coalesce(${schema.leads.decisionMakerStatus}, excluded.decision_maker_status)`,
          extra: sql`coalesce(excluded.extra, '{}'::jsonb) || coalesce(${schema.leads.extra}, '{}'::jsonb)`,
          saved: sql`${schema.leads.saved} or excluded.saved`,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: schema.leads.id,
        leadKey: schema.leads.leadKey,
        inserted: sql<boolean>`(xmax = 0)`,
      });

    const newIds: number[] = [];
    for (const r of returned) {
      result.idsByKey.set(r.leadKey, r.id);
      for (const alias of aliases.get(r.leadKey) ?? []) result.idsByKey.set(alias, r.id);
      if (r.inserted) {
        result.inserted++;
        newIds.push(r.id);
      } else {
        result.updated++;
      }
    }
    if (newIds.length) {
      await db()
        .insert(schema.leadActivities)
        .values(
          newIds.map((leadId) => ({
            leadId,
            userId,
            type: "imported",
            detail: { via: opts.via || "search", searchId: opts.sourceSearchId ?? null },
          }))
        );
    }
  }

  return result;
}

// Map each lead's own key to the CRM row it belongs to. An email, phone, or
// location match wins, so a second OpenStreetMap entry for the same business
// points at the earliest row. A lead with no shared identity still resolves by
// its stored key when that row exists.
export async function crmIdsForLeads(userId: number, rawLeads: unknown[]): Promise<Map<string, number>> {
  const keys: string[] = [];
  const leads: unknown[] = [];
  for (const raw of rawLeads) {
    if (!raw || typeof raw !== "object") continue;
    const key = leadKey(raw as LeadLike);
    if (!key.replace(/\|/g, "")) continue;
    keys.push(key);
    leads.push(raw);
  }

  const ids = new Map<string, number>();
  const matches = await loadExistingMatches(userId, leads);
  for (let i = 0; i < leads.length; i++) {
    const match = earliestMatch(leads[i], matches);
    if (match) ids.set(keys[i], match.id);
  }

  const missing = keys.filter((key) => !ids.has(key));
  for (let i = 0; i < missing.length; i += 1000) {
    const slice = missing.slice(i, i + 1000);
    if (!slice.length) continue;
    const found = await db()
      .select({ id: schema.leads.id, leadKey: schema.leads.leadKey })
      .from(schema.leads)
      .where(and(eq(schema.leads.userId, userId), inArray(schema.leads.leadKey, slice)));
    for (const row of found) ids.set(row.leadKey, row.id);
  }
  return ids;
}

// One-time import of pre-CRM data (search result blobs + starred leads). The
// claim-first update makes concurrent first loads import only once.
export async function backfillLegacyLeads(userId: number): Promise<void> {
  const [claimed] = await db()
    .update(schema.users)
    .set({ crmBackfilledAt: new Date() })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.crmBackfilledAt)))
    .returning({ id: schema.users.id });
  if (!claimed) return;

  try {
    const searches = await db().query.searches.findMany({
      where: eq(schema.searches.userId, userId),
      orderBy: [asc(schema.searches.createdAt)],
      limit: 200,
    });
    for (const s of searches) {
      const blob = s.resultBlob;
      if (Array.isArray(blob) && blob.length) {
        await upsertLeads(userId, blob, { sourceSearchId: s.id, via: "history" });
      }
    }

    const starred = await db().query.savedLeads.findMany({
      where: eq(schema.savedLeads.userId, userId),
    });
    if (starred.length) {
      await upsertLeads(
        userId,
        starred.map((r) => r.lead),
        { saved: true, via: "saved" }
      );
    }
  } catch (err) {
    await db()
      .update(schema.users)
      .set({ crmBackfilledAt: null })
      .where(eq(schema.users.id, userId));
    throw err;
  }
}

export async function logActivity(
  userId: number,
  leadIds: number[],
  type: string,
  detail: Record<string, unknown> | null = null
): Promise<void> {
  if (!leadIds.length) return;
  await db()
    .insert(schema.leadActivities)
    .values(leadIds.map((leadId) => ({ leadId, userId, type, detail })));
  await db()
    .update(schema.leads)
    .set({ lastActivityAt: new Date() })
    .where(and(eq(schema.leads.userId, userId), inArray(schema.leads.id, leadIds)));
}

export interface CrmLead {
  id: number;
  leadKey: string;
  status: string;
  saved: boolean;
  name: string;
  niche: string;
  nicheKey: string;
  state: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  contactName: string;
  osmLink: string;
  decisionMakers: unknown[] | null;
  decisionMakerStatus: string | null;
  websiteLinkedIn: string;
  emailsFound: string[];
  sourceSearchId: number | null;
  followUpAt: string | null;
  lastActivityAt: string;
  createdAt: string;
}

export function serializeLead(row: LeadRow): CrmLead {
  const extra = (row.extra as Record<string, unknown> | null) || {};
  return {
    id: row.id,
    leadKey: row.leadKey,
    status: row.status,
    saved: row.saved,
    name: row.name,
    niche: row.niche,
    nicheKey: row.nicheKey,
    state: row.state,
    city: row.city,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    contactName: row.contactName,
    osmLink: row.osmLink,
    decisionMakers: Array.isArray(row.decisionMakers) ? row.decisionMakers : null,
    decisionMakerStatus: row.decisionMakerStatus,
    websiteLinkedIn: str(extra.websiteLinkedIn),
    emailsFound: Array.isArray(extra.emailsFound) ? (extra.emailsFound as string[]) : [],
    sourceSearchId: row.sourceSearchId,
    followUpAt: row.followUpAt ? row.followUpAt.toISOString() : null,
    lastActivityAt: row.lastActivityAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
