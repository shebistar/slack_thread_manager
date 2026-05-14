CREATE TYPE "public"."staging_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "staging_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"batch_id" uuid,
	"original_content" jsonb NOT NULL,
	"anonymized_content" jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "staging_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staging_queue" ADD CONSTRAINT "staging_queue_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_queue" ADD CONSTRAINT "staging_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_staging_queue_thread_id" ON "staging_queue" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_staging_queue_status" ON "staging_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_staging_queue_batch_id" ON "staging_queue" USING btree ("batch_id");