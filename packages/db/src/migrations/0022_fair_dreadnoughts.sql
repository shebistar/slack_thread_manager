ALTER TYPE "public"."briefing_item_type" ADD VALUE IF NOT EXISTS 'backfill';--> statement-breakpoint
DROP INDEX IF EXISTS "uq_silence_alerts_thread_status";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_silence_alerts_active_thread";--> statement-breakpoint
-- IF NOT EXISTS guards this statement in case a hash change on this file (e.g. this idempotency
-- retrofit itself) causes migrate-raw.js to treat it as unapplied and re-run it on an environment
-- where the index already exists from an earlier pass.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_silence_alerts_active_thread" ON "silence_alerts" USING btree ("thread_id") WHERE "silence_alerts"."status" = 'active';