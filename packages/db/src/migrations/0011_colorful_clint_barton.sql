CREATE TYPE "public"."correlation_type" AS ENUM('semantic', 'topic_match', 'participant_overlap');--> statement-breakpoint
CREATE TABLE "topic_correlations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_thread_id" uuid NOT NULL,
	"correlated_thread_id" uuid NOT NULL,
	"correlation_type" "correlation_type" NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_correlations" ADD CONSTRAINT "topic_correlations_source_thread_id_slack_threads_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_correlations" ADD CONSTRAINT "topic_correlations_correlated_thread_id_slack_threads_id_fk" FOREIGN KEY ("correlated_thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_topic_correlations_pair" ON "topic_correlations" USING btree ("source_thread_id","correlated_thread_id");--> statement-breakpoint
CREATE INDEX "idx_topic_correlations_source" ON "topic_correlations" USING btree ("source_thread_id");--> statement-breakpoint
CREATE INDEX "idx_topic_correlations_correlated" ON "topic_correlations" USING btree ("correlated_thread_id");