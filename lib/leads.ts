import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { leadKey, type LeadLike } from "./leadKey";
import { STATUS_LABELS, isLeadStatus } from "./crm";
import { isContactable } from "@/src/contactable.js";

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

export async function upsertLeads(
  userId: number,
  rawLeads: unknown[],
  opts: { sourceSearchId?: number | null; saved?: boolean; via?: string } = {}
): Promise<UpsertResult> {
  const byKey = new Map<string, LeadInsert>();
  for (const raw of rawLeads) {
    if (!raw || typeof raw !== "object") continue;
    const row = toInsert(userId, raw as RawLead, opts.sourceSearchId ?? null);
    if (!row) continue;
    const prev = byKey.get(row.leadKey);
    byKey.set(row.leadKey, prev ? mergeInserts(prev, row) : row);
  }

  const result: UpsertResult = { inserted: 0, updated: 0, idsByKey: new Map() };
  const rows = Array.from(byKey.values()).map((r) => ({ ...r, saved: Boolean(opts.saved) }));

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

// Shape a CRM row for `leadsToBuffer`, which expects scraper-style lead objects.
export function toExportLead(row: LeadRow): Record<string, unknown> {
  const extra = (row.extra as Record<string, unknown> | null) || {};
  return {
    ...extra,
    name: row.name,
    niche: row.niche,
    state: row.state,
    city: row.city,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    osmLink: row.osmLink,
    decisionMakers: row.decisionMakers,
    status: isLeadStatus(row.status) ? STATUS_LABELS[row.status] : row.status,
    saved: row.saved ? "Yes" : "",
    contactName: row.contactName,
    followUpAt: row.followUpAt ? row.followUpAt.toISOString().slice(0, 10) : "",
  };
}

export const CRM_EXPORT_COLUMNS = [
  { key: "status", header: "Status", width: 14 },
  { key: "saved", header: "Saved", width: 8 },
  { key: "contactName", header: "Contact Name", width: 24 },
  { key: "followUpAt", header: "Follow Up", width: 12 },
];
