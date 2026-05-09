CREATE TYPE "public"."pipeline_state" AS ENUM('ingested', 'classified', 'summarized', 'embedded', 'staged', 'approved', 'delivered', 'failed', 'pending_retry');--> statement-breakpoint
CREATE TABLE "pipeline_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"pipeline_stage" "pipeline_state" NOT NULL,
	"error_message" text NOT NULL,
	"error_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"threads_processed" integer DEFAULT 0 NOT NULL,
	"threads_failed" integer DEFAULT 0 NOT NULL,
	"fallback_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_threads" ALTER COLUMN "pipeline_state" SET DEFAULT 'ingested'::"public"."pipeline_state";--> statement-breakpoint
ALTER TABLE "slack_threads" ALTER COLUMN "pipeline_state" SET DATA TYPE "public"."pipeline_state" USING "pipeline_state"::"public"."pipeline_state";--> statement-breakpoint
ALTER TABLE "slack_threads" ADD COLUMN "processing_date" date;--> statement-breakpoint
ALTER TABLE "pipeline_failures" ADD CONSTRAINT "pipeline_failures_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;