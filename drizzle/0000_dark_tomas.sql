CREATE TYPE "public"."recommendation_source" AS ENUM('claude', 'tmdb_similar', 'manual');--> statement-breakpoint
CREATE TYPE "public"."show_status" AS ENUM('want', 'watching', 'watched', 'dropped');--> statement-breakpoint
CREATE TABLE "episodes" (
	"tmdb_id" integer PRIMARY KEY NOT NULL,
	"show_tmdb_id" integer NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"name" text,
	"overview" text,
	"still_path" text,
	"air_date" varchar(10),
	"runtime" integer,
	CONSTRAINT "episodes_show_season_episode_key" UNIQUE("show_tmdb_id","season_number","episode_number")
);
--> statement-breakpoint
CREATE TABLE "list_entries" (
	"show_tmdb_id" integer PRIMARY KEY NOT NULL,
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
	"show_tmdb_id" integer NOT NULL,
	"episode_tmdb_id" integer,
	"stars" smallint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"show_tmdb_id" integer NOT NULL,
	"source" "recommendation_source" NOT NULL,
	"reason" text NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendations_one_per_show_key" UNIQUE("show_tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "shows" (
	"tmdb_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"overview" text,
	"poster_path" text,
	"backdrop_path" text,
	"first_air_date" varchar(10),
	"last_air_date" varchar(10),
	"status" varchar(32),
	"number_of_seasons" integer,
	"number_of_episodes" integer,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"user_id" uuid NOT NULL,
	"episode_tmdb_id" integer NOT NULL,
	"show_tmdb_id" integer NOT NULL,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watches_user_id_episode_tmdb_id_pk" PRIMARY KEY("user_id","episode_tmdb_id")
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_show_tmdb_id_shows_tmdb_id_fk" FOREIGN KEY ("show_tmdb_id") REFERENCES "public"."shows"("tmdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_show_tmdb_id_shows_tmdb_id_fk" FOREIGN KEY ("show_tmdb_id") REFERENCES "public"."shows"("tmdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_show_tmdb_id_shows_tmdb_id_fk" FOREIGN KEY ("show_tmdb_id") REFERENCES "public"."shows"("tmdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_episode_tmdb_id_episodes_tmdb_id_fk" FOREIGN KEY ("episode_tmdb_id") REFERENCES "public"."episodes"("tmdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_show_tmdb_id_shows_tmdb_id_fk" FOREIGN KEY ("show_tmdb_id") REFERENCES "public"."shows"("tmdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_episode_tmdb_id_episodes_tmdb_id_fk" FOREIGN KEY ("episode_tmdb_id") REFERENCES "public"."episodes"("tmdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_show_tmdb_id_shows_tmdb_id_fk" FOREIGN KEY ("show_tmdb_id") REFERENCES "public"."shows"("tmdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episodes_show_idx" ON "episodes" USING btree ("show_tmdb_id");--> statement-breakpoint
CREATE INDEX "list_entries_status_idx" ON "list_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ratings_show_idx" ON "ratings" USING btree ("show_tmdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_one_per_user_per_show" ON "ratings" USING btree ("user_id","show_tmdb_id") WHERE "ratings"."episode_tmdb_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_one_per_user_per_episode" ON "ratings" USING btree ("user_id","episode_tmdb_id") WHERE "ratings"."episode_tmdb_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recommendations_dismissed_idx" ON "recommendations" USING btree ("dismissed");--> statement-breakpoint
CREATE INDEX "watches_user_show_idx" ON "watches" USING btree ("user_id","show_tmdb_id");--> statement-breakpoint
CREATE INDEX "watches_show_idx" ON "watches" USING btree ("show_tmdb_id");