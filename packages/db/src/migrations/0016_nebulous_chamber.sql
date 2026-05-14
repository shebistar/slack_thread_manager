CREATE TABLE "briefing_item_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"briefing_item_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefing_item_reads" ADD CONSTRAINT "briefing_item_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_item_reads" ADD CONSTRAINT "briefing_item_reads_briefing_item_id_briefing_items_id_fk" FOREIGN KEY ("briefing_item_id") REFERENCES "public"."briefing_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_briefing_item_reads_user_item" ON "briefing_item_reads" USING btree ("user_id","briefing_item_id");--> statement-breakpoint
CREATE INDEX "idx_briefing_item_reads_user_id" ON "briefing_item_reads" USING btree ("user_id");