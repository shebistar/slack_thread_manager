CREATE TYPE "public"."briefing_item_type" AS ENUM('standard', 'cross_workstream', 'orphaned_action', 'gone_quiet');--> statement-breakpoint
CREATE TYPE "public"."briefing_shape" AS ENUM('executive_scan', 'filtered_brief', 'intelligence_report');--> statement-breakpoint
CREATE TABLE "briefing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"briefing_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"summary_text" text NOT NULL,
	"workstream_name" text,
	"source_thread_url" text,
	"item_type" "briefing_item_type" DEFAULT 'standard' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"briefing_date" timestamp with time zone NOT NULL,
	"briefing_shape" "briefing_shape" NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_count" integer DEFAULT 0 NOT NULL,
	"workstream_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefing_items" ADD CONSTRAINT "briefing_items_briefing_id_briefings_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_items" ADD CONSTRAINT "briefing_items_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_briefing_items_briefing_id" ON "briefing_items" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX "idx_briefing_items_thread_id" ON "briefing_items" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_briefings_user_date" ON "briefings" USING btree ("user_id","briefing_date");--> statement-breakpoint
CREATE INDEX "idx_briefings_user_id" ON "briefings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_briefings_date" ON "briefings" USING btree ("briefing_date");