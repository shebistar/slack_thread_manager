CREATE TYPE "public"."blocklist_category" AS ENUM('company_name', 'person_name', 'url', 'account_id', 'infrastructure');--> statement-breakpoint
CREATE TABLE "anonymization_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"replacement" text NOT NULL,
	"category" "blocklist_category" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_anonymization_blocklist_term" ON "anonymization_blocklist" USING btree ("term");