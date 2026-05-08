CREATE TABLE "slack_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_team_id" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"thread_ts" text NOT NULL,
	"latest_reply_ts" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"raw_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"participant_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_ts" text NOT NULL,
	"user_handle" text,
	"text" text DEFAULT '' NOT NULL,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_threads" ADD CONSTRAINT "slack_threads_channel_id_slack_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."slack_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_slack_threads_dedup" ON "slack_threads" USING btree ("slack_team_id","channel_id","thread_ts");--> statement-breakpoint
CREATE INDEX "idx_slack_threads_channel_id" ON "slack_threads" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_slack_threads_thread_ts" ON "slack_threads" USING btree ("thread_ts");--> statement-breakpoint
CREATE INDEX "idx_thread_messages_thread_id" ON "thread_messages" USING btree ("thread_id");