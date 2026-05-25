CREATE TABLE "silence_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workstream_id" uuid,
	"threshold_days" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_silence_thresholds_days_range" CHECK ("silence_thresholds"."threshold_days" >= 1 AND "silence_thresholds"."threshold_days" <= 30)
);
--> statement-breakpoint
ALTER TABLE "silence_thresholds" ADD CONSTRAINT "silence_thresholds_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_silence_thresholds_workstream_key" ON "silence_thresholds" USING btree (coalesce("workstream_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "idx_silence_thresholds_workstream_id" ON "silence_thresholds" USING btree ("workstream_id");--> statement-breakpoint
INSERT INTO "silence_thresholds" ("workstream_id", "threshold_days")
SELECT NULL, 3
WHERE NOT EXISTS (
  SELECT 1 FROM "silence_thresholds" WHERE "workstream_id" IS NULL
);