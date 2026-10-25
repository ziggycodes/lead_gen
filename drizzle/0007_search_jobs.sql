ALTER TABLE "searches" ADD COLUMN "progress" jsonb;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "seen_keys" jsonb;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "cancel_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "completion_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "searches_user_created_idx" ON "searches" USING btree ("user_id","created_at");--> statement-breakpoint
UPDATE "searches" SET "completion_seen_at" = coalesce("completed_at", "created_at") WHERE "status" <> 'running';
--> statement-breakpoint
UPDATE "searches" SET "status" = 'failed', "error" = 'timed out', "completed_at" = now(), "completion_seen_at" = now() WHERE "status" = 'running' AND "created_at" < now() - interval '1 hour';
