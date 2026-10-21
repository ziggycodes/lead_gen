CREATE TABLE "email_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"address" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"status" text DEFAULT 'error' NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"lead_id" integer,
	"direction" text NOT NULL,
	"message_id" text NOT NULL,
	"counterparty" text NOT NULL,
	"from_address" text DEFAULT '' NOT NULL,
	"to_address" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_accounts_user_address_idx" ON "email_accounts" USING btree ("user_id","address");--> statement-breakpoint
CREATE INDEX "email_accounts_user_idx" ON "email_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_account_msgid_idx" ON "email_messages" USING btree ("account_id","message_id");--> statement-breakpoint
CREATE INDEX "email_messages_user_party_idx" ON "email_messages" USING btree ("user_id","counterparty");--> statement-breakpoint
CREATE INDEX "email_messages_account_sent_idx" ON "email_messages" USING btree ("account_id","sent_at");