CREATE TABLE "thread_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"embedding" vector(768) NOT NULL,
	"model_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thread_embeddings" ADD CONSTRAINT "thread_embeddings_thread_id_slack_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."slack_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_thread_embeddings_thread_id_unique" ON "thread_embeddings" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_thread_embeddings_hnsw" ON "thread_embeddings" USING hnsw ("embedding" vector_cosine_ops);