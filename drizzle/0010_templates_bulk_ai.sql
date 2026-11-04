CREATE TABLE "bulk_send_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulk_send_id" integer NOT NULL,
	"lead_id" integer,
	"email" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bulk_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"template_id" integer,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "insight" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "insight_status" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "insight_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "offer_profile" jsonb;--> statement-breakpoint
ALTER TABLE "bulk_send_recipients" ADD CONSTRAINT "bulk_send_recipients_bulk_send_id_bulk_sends_id_fk" FOREIGN KEY ("bulk_send_id") REFERENCES "public"."bulk_sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_send_recipients" ADD CONSTRAINT "bulk_send_recipients_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_sends" ADD CONSTRAINT "bulk_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_sends" ADD CONSTRAINT "bulk_sends_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_sends" ADD CONSTRAINT "bulk_sends_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_send_recipients_send_idx" ON "bulk_send_recipients" USING btree ("bulk_send_id","status");--> statement-breakpoint
CREATE INDEX "bulk_sends_user_created_idx" ON "bulk_sends" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_templates_user_idx" ON "email_templates" USING btree ("user_id");