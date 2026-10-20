import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  date,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    clerkId: text("clerk_id").notNull(),
    email: text("email"),
    country: text("country"),
    plan: text("plan").notNull().default("free"),
    paystackCustomerCode: text("paystack_customer_code"),
    // Set once legacy saved leads and search blobs have been imported into `leads`.
    crmBackfilledAt: timestamp("crm_backfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_clerk_id_idx").on(t.clerkId)]
);

// Single-balance model: every user starts with the 50-lead free trial as balance.
// Credit-pack purchases add to balance. Searches reserve, then consume from it.
export const usage = pgTable("usage", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(50),
  reserved: integer("reserved").notNull().default(0),
  consumedToday: integer("consumed_today").notNull().default(0),
  dailyResetAt: date("daily_reset_at"),
  totalConsumed: integer("total_consumed").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const searches = pgTable("searches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"), // running | completed | failed | cancelled
  params: jsonb("params"),
  leadCount: integer("lead_count").notNull().default(0),
  resultBlob: jsonb("result_blob"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// Legacy star list, superseded by `leads.saved`. Kept only as a backfill source.
export const savedLeads = pgTable(
  "saved_leads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leadKey: text("lead_key").notNull(),
    lead: jsonb("lead").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("saved_leads_user_key_idx").on(t.userId, t.leadKey)]
);

// One CRM record per business per account. `leadKey` is the same stable dedup
// key as `lib/leadKey.ts`, so re-running a search never duplicates a lead.
export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leadKey: text("lead_key").notNull(),
    status: text("status").notNull().default("new"),
    saved: boolean("saved").notNull().default(false),
    name: text("name").notNull(),
    niche: text("niche").notNull().default(""),
    nicheKey: text("niche_key").notNull().default(""),
    state: text("state").notNull().default(""),
    city: text("city").notNull().default(""),
    address: text("address").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    website: text("website").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    osmLink: text("osm_link").notNull().default(""),
    decisionMakers: jsonb("decision_makers"),
    decisionMakerStatus: text("decision_maker_status"),
    // Remaining scraped fields (emailsFound, websiteLinkedIn, lat/lon, ...).
    extra: jsonb("extra"),
    sourceSearchId: integer("source_search_id").references(() => searches.id, {
      onDelete: "set null",
    }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_user_key_idx").on(t.userId, t.leadKey),
    index("leads_user_status_idx").on(t.userId, t.status),
  ]
);

export const leadNotes = pgTable(
  "lead_notes",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_notes_lead_idx").on(t.leadId)]
);

// Timeline events: imported, status_changed, saved, unsaved, note_added,
// updated, follow_up_set, decision_makers_found.
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId)]
);

// Idempotency ledger for Paystack payments (callback verify + webhook can both fire).
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    amountKobo: integer("amount_kobo").notNull(),
    credits: integer("credits").notNull(),
    status: text("status").notNull().default("pending"), // pending | success | failed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payments_reference_idx").on(t.reference)]
);

// Cached Overpass responses keyed by a hash of the query, shared across users.
export const overpassCache = pgTable("overpass_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
