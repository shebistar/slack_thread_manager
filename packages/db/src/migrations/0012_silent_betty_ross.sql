CREATE TYPE "public"."orphaned_action_status" AS ENUM('orphaned', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "orphaned_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"action_text" text NOT NULL,
	"assigned_to" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "orphaned_action_status" DEFAULT 'orphaned' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orphaned_actions" ADD CONSTRAINT "orphaned_actions_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_orphaned_actions_thread_action" ON "orphaned_actions" USING btree ("thread_id","action_text");--> statement-breakpoint
CREATE INDEX "idx_orphaned_actions_status" ON "orphaned_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orphaned_actions_thread_id" ON "orphaned_actions" USING btree ("thread_id");