CREATE TYPE "public"."user_role" AS ENUM('ARCHITECT', 'PM', 'CONSULTANT', 'SALES', 'TRAINING', 'ADMIN');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"slack_handle" text NOT NULL,
	"slack_nicknames" text[] DEFAULT '{}' NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_workstreams" (
	"user_id" uuid NOT NULL,
	"workstream_id" uuid NOT NULL,
	CONSTRAINT "user_workstreams_user_id_workstream_id_pk" PRIMARY KEY("user_id","workstream_id")
);
--> statement-breakpoint
CREATE TABLE "workstreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_channel_id" text NOT NULL,
	"name" text NOT NULL,
	"workstream_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_workstreams" ADD CONSTRAINT "user_workstreams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workstreams" ADD CONSTRAINT "user_workstreams_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channels" ADD CONSTRAINT "slack_channels_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_slack_handle" ON "users" USING btree ("slack_handle");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_user_workstreams_user_id" ON "user_workstreams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_workstreams_workstream_id" ON "user_workstreams" USING btree ("workstream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workstreams_name" ON "workstreams" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_slack_channels_slack_channel_id" ON "slack_channels" USING btree ("slack_channel_id");--> statement-breakpoint
CREATE INDEX "idx_slack_channels_workstream_id" ON "slack_channels" USING btree ("workstream_id");--> statement-breakpoint
CREATE INDEX "idx_slack_channels_is_active" ON "slack_channels" USING btree ("is_active");