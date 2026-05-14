CREATE TYPE "public"."silence_alert_status" AS ENUM('active', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "silence_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"workstream_id" uuid,
	"topic_name" text NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"silence_days" integer NOT NULL,
	"participant_count" integer NOT NULL,
	"status" "silence_alert_status" DEFAULT 'active' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "silence_alerts" ADD CONSTRAINT "silence_alerts_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silence_alerts" ADD CONSTRAINT "silence_alerts_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_silence_alerts_status" ON "silence_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_silence_alerts_workstream_id" ON "silence_alerts" USING btree ("workstream_id");--> statement-breakpoint
CREATE INDEX "idx_silence_alerts_detected_at" ON "silence_alerts" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "idx_silence_alerts_thread_id" ON "silence_alerts" USING btree ("thread_id");