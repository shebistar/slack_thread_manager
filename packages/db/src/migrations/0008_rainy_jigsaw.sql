CREATE TABLE "classified_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"primary_topic" text NOT NULL,
	"secondary_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"workstream_id" uuid,
	"confidence" real NOT NULL,
	"model_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classified_topics" ADD CONSTRAINT "classified_topics_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_topics" ADD CONSTRAINT "classified_topics_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_classified_topics_thread_id" ON "classified_topics" USING btree ("thread_id");