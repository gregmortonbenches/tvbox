ALTER TABLE "titles" ADD COLUMN "imdb_id" varchar(12);--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "rt_critic" smallint;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "imdb_rating" smallint;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "metascore" smallint;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "ratings_fetched_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "titles_imdb_id_idx" ON "titles" USING btree ("imdb_id");--> statement-breakpoint
CREATE INDEX "titles_ratings_fetched_idx" ON "titles" USING btree ("ratings_fetched_at");