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
    name: text("name"),
    country: text("country"),
    plan: text("plan").notNull().default("free"),
    paystackCustomerCode: text("paystack_customer_code"),
    // Set once legacy saved leads and search blobs have been imported into `leads`.
    crmBackfilledAt: timestamp("crm_backfilled_at", { withTimezone: true }),
    // active | flagged | restricted. Flagged accounts can still use the CRM
    // and mail. Restricted accounts are locked out until an admin lifts it.
    accountStatus: text("account_status").notNull().default("active"),
    accountNote: text("account_note"),
    // Null means contact emails found in searches are unlimited.
    emailDailyLimit: integer("email_daily_limit"),
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
  // Contact emails found in searches today. One per lead that has an email.
  emailsFoundToday: integer("emails_found_today").notNull().default(0),
  emailsFoundOn: date("emails_found_on"),
  totalConsumed: integer("total_consumed").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// What an admin did to an account, shown to that user until they dismiss it.
export const accountNotices = pgTable(
  "account_notices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("account_notices_user_idx").on(t.userId)]
);

// A search is a background job. The worker saves leads into `leads` as it goes,
// so leaving the page never loses them.
export const searches = pgTable(
  "searches",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"), // queued | running | completed | failed | cancelled
    params: jsonb("params"),
    // leadCount counts leads this search found; progress.saved counts new CRM rows.
    leadCount: integer("lead_count").notNull().default(0),
    resultBlob: jsonb("result_blob"),
    progress: jsonb("progress"),
    // Dedupe keys already claimed by this search, so parallel steps don't repeat a business.
    seenKeys: jsonb("seen_keys"),
    error: text("error"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    // Set when the user has seen the "search finished" popup.
    completionSeenAt: timestamp("completion_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("searches_user_created_idx").on(t.userId, t.createdAt)]
);

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
// updated, follow_up_set, decision_makers_found, email_sent, email_received.
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

// A mailbox the account connected so LeadScout can send and read mail.
// `secretCiphertext` is the app password, encrypted. It is never returned to the browser.
export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // gmail | business
    address: text("address").notNull(),
    fromName: text("from_name").notNull().default(""),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    status: text("status").notNull().default("error"), // connected | error
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_accounts_user_address_idx").on(t.userId, t.address),
    index("email_accounts_user_idx").on(t.userId),
  ]
);

// One row per message on a connected mailbox. A conversation is every row
// that shares `counterparty` (the other person's address).
export const emailMessages = pgTable(
  "email_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: integer("account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    direction: text("direction").notNull(), // inbound | outbound
    messageId: text("message_id").notNull(),
    counterparty: text("counterparty").notNull(),
    fromAddress: text("from_address").notNull().default(""),
    toAddress: text("to_address").notNull().default(""),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_messages_account_msgid_idx").on(t.accountId, t.messageId),
    index("email_messages_user_party_idx").on(t.userId, t.counterparty),
    index("email_messages_account_sent_idx").on(t.accountId, t.sentAt),
  ]
);

// Audit trail of admin changes. Admins are identified by email because an
// ADMIN_EMAILS address may never have opened the app and so has no users row.
export const adminActions = pgTable(
  "admin_actions",
  {
    id: serial("id").primaryKey(),
    adminEmail: text("admin_email").notNull(),
    targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "set null" }),
    // Allowlist actions have no account; the email lives here instead.
    targetEmail: text("target_email"),
    action: text("action").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("admin_actions_target_created_idx").on(t.targetUserId, t.createdAt),
    index("admin_actions_created_idx").on(t.createdAt),
  ]
);

// Emails allowed to sign in, besides the admin addresses in ADMIN_EMAILS.
export const allowedEmails = pgTable("allowed_emails", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cached Overpass responses keyed by a hash of the query, shared across users.
export const overpassCache = pgTable("overpass_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// One row per browser that allowed notifications. The endpoint identifies the browser.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ]
);
