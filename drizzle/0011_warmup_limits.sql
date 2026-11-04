ALTER TABLE "bulk_sends" ADD COLUMN "resume_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "timezone" text DEFAULT 'Africa/Lagos' NOT NULL;