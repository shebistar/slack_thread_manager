ALTER TABLE "classified_topics" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
CREATE INDEX "idx_classified_topics_search_vector" ON "classified_topics" USING gin ("search_vector");