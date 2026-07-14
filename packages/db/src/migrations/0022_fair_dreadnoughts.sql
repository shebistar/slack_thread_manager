ALTER TYPE "public"."briefing_item_type" ADD VALUE 'backfill';--> statement-breakpoint
DROP INDEX IF EXISTS "uq_silence_alerts_thread_status";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_silence_alerts_active_thread";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_silence_alerts_active_thread" ON "silence_alerts" USING btree ("thread_id") WHERE "silence_alerts"."status" = 'active';