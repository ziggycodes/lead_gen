import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  date,
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

// Leads the user has explicitly starred/saved. `leadKey` is a stable dedup key
// (osmLink when available, otherwise a name+city fallback) so a lead can't be
// saved twice for the same user.
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
