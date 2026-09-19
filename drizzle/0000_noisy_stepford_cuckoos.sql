CREATE TYPE "public"."media_type" AS ENUM('tv', 'film');--> statement-breakpoint
CREATE TYPE "public"."recommendation_source" AS ENUM('claude', 'tmdb_similar', 'manual');--> statement-breakpoint
CREATE TYPE "public"."show_status" AS ENUM('want', 'watching', 'watched', 'dropped');--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title_id" uuid NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"name" text,
	"overview" text,
	"still_path" text,
	"air_date" varchar(10),
	"runtime" integer,
	CONSTRAINT "episodes_tmdb_id_unique" UNIQUE("tmdb_id"),
	CONSTRAINT "episodes_title_season_episode_key" UNIQUE("title_id","season_number","episode_number")
);
--> statement-breakpoint
CREATE TABLE "list_entries" (
	"title_id" uuid PRIMARY KEY NOT NULL,
	"status" "show_status" DEFAULT 'want' NOT NULL,
	"added_by_user_id" uuid NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"episode_id" uuid,
	"stars" smallint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"source" "recommendation_source" NOT NULL,
	"reason" text NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendations_title_id_unique" UNIQUE("title_id")
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"name" text NOT NULL,
	"overview" text,
	"poster_path" text,
	"backdrop_path" text,
	"release_date" varchar(10),
	"status" varchar(32),
	"last_air_date" varchar(10),
	"number_of_seasons" integer,
	"number_of_episodes" integer,
	"runtime" integer,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titles_tmdb_media_key" UNIQUE("tmdb_id","media_type")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(32) NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"accent_color" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"episode_id" uuid,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episodes_title_idx" ON "episodes" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "list_entries_status_idx" ON "list_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ratings_title_idx" ON "ratings" USING btree ("title_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_one_per_user_per_title" ON "ratings" USING btree ("user_id","title_id") WHERE "ratings"."episode_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_one_per_user_per_episode" ON "ratings" USING btree ("user_id","episode_id") WHERE "ratings"."episode_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recommendations_dismissed_idx" ON "recommendations" USING btree ("dismissed");--> statement-breakpoint
CREATE INDEX "titles_media_type_idx" ON "titles" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "watches_user_title_idx" ON "watches" USING btree ("user_id","title_id");--> statement-breakpoint
CREATE INDEX "watches_title_idx" ON "watches" USING btree ("title_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watches_one_per_user_per_film" ON "watches" USING btree ("user_id","title_id") WHERE "watches"."episode_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "watches_one_per_user_per_episode" ON "watches" USING btree ("user_id","episode_id") WHERE "watches"."episode_id" IS NOT NULL;