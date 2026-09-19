/*
 * Database schema (Drizzle + Postgres).
 *
 * This is a PRIVATE two-person app — Greg and Hannah — not a public social
 * site. That shapes almost every decision below:
 *
 *   - `users` holds exactly two seeded rows. No sign-up, no follows.
 *   - The WATCHLIST IS SHARED. One list, so `list_entries` carries no user
 *     id — just who added it, for interest.
 *   - EPISODE WATCHES ARE PER-PERSON, so the UI can show "both watched" vs
 *     "only Hannah has seen this one".
 *   - RATINGS ARE PER-PERSON, by explicit request.
 *
 * TMDB is the source of truth for what exists; this database is the source
 * of truth for what the two of you did about it.
 *
 * ---- Why `titles` has a surrogate key -------------------------------------
 *
 * This table holds BOTH TV series and films. TMDB numbers those in separate
 * sequences, so a tmdb_id is NOT unique on its own — movie 1396 and TV 1396
 * are different works. The natural key is therefore the PAIR
 * (tmdb_id, media_type), kept as a unique constraint.
 *
 * A composite primary key would push two columns into all five referencing
 * tables and into every join. A surrogate `id` keeps those foreign keys
 * single-column. Nothing is lost: the cache helpers upsert with RETURNING,
 * so callers get the id back without an extra round trip.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Exactly two rows, created by `npm run db:seed`. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  /** Hex colour so each person's ticks/ratings are visually distinct. */
  accentColor: varchar("accent_color", { length: 7 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** "tv" or "film" — the discriminator that makes a tmdb_id unambiguous. */
export const mediaType = pgEnum("media_type", ["tv", "film"]);

/** Local cache of a TMDB series or film. */
export const titles = pgTable(
  "titles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: mediaType("media_type").notNull(),

    name: text("name").notNull(),
    overview: text("overview"),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    /** TV: first_air_date. Film: release_date. Same meaning here: "when". */
    releaseDate: varchar("release_date", { length: 10 }),
    status: varchar("status", { length: 32 }),

    /* TV only — null for films. A film's "progress" is binary, so it has no
       episode count and gets a watched/not-watched tick instead of a bar. */
    lastAirDate: varchar("last_air_date", { length: 10 }),
    numberOfSeasons: integer("number_of_seasons"),
    numberOfEpisodes: integer("number_of_episodes"),

    /* Film only — null for TV. */
    runtime: integer("runtime"),

    /*
     * External ratings, fetched from OMDb — see lib/omdb.ts.
     *
     * Rotten Tomatoes has no self-serve API (access is an approved-partner
     * licence), so the Tomatometer arrives second-hand via OMDb. That means
     * the CRITIC score only: OMDb does not carry RT's audience score.
     *
     * `imdbId` is what OMDb is keyed on, so it's cached here rather than
     * re-fetched from TMDB on every backfill.
     *
     * Stored as integers on purpose:
     *   rtCritic / metascore  0..100
     *   imdbRating            TENTHS, so 85 means 8.5 — same trick as the
     *                         half-star ratings, and it avoids Postgres
     *                         numeric coming back as a string in Drizzle.
     */
    imdbId: varchar("imdb_id", { length: 12 }),
    rtCritic: smallint("rt_critic"),
    imdbRating: smallint("imdb_rating"),
    metascore: smallint("metascore"),
    /** Null means never looked up; a date means looked up, possibly finding
     *  nothing — the two cases must stay distinguishable or the backfill
     *  re-queries every title with no scores, forever. */
    ratingsFetchedAt: timestamp("ratings_fetched_at", { withTimezone: true }),

    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("titles_tmdb_media_key").on(t.tmdbId, t.mediaType),
    index("titles_media_type_idx").on(t.mediaType),
    index("titles_imdb_id_idx").on(t.imdbId),
    /* Drives "what still needs a backfill" without a full scan. */
    index("titles_ratings_fetched_idx").on(t.ratingsFetchedAt),
  ],
);

/** Local cache of a TMDB episode. TV only — films never appear here. */
export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmdbId: integer("tmdb_id").notNull().unique(),
    titleId: uuid("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    name: text("name"),
    overview: text("overview"),
    stillPath: text("still_path"),
    airDate: varchar("air_date", { length: 10 }),
    runtime: integer("runtime"),
  },
  (t) => [
    index("episodes_title_idx").on(t.titleId),
    unique("episodes_title_season_episode_key").on(
      t.titleId,
      t.seasonNumber,
      t.episodeNumber,
    ),
  ],
);

/*
 * Where a title sits for the household. One row per title (NOT per user) —
 * the list is shared.
 *
 *   want     — on the watchlist, not started
 *   watching — in progress (TV only in practice; a film goes want -> watched)
 *   watched  — finished; this is what the Archive lists
 *   dropped  — abandoned, kept so it stops being re-suggested
 *
 * Stored explicitly rather than computed from episode ticks: TMDB episode
 * counts shift as specials get added, so "all episodes ticked" silently
 * stops being true for shows you've definitely finished.
 */
export const showStatus = pgEnum("show_status", [
  "want",
  "watching",
  "watched",
  "dropped",
]);

export const listEntries = pgTable(
  "list_entries",
  {
    titleId: uuid("title_id")
      .primaryKey()
      .references(() => titles.id, { onDelete: "cascade" }),
    status: showStatus("status").notNull().default("want"),
    /** Who put it on the list — a nicety, not access control. */
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /*
     * Manual priority. Lower sorts first; new entries land at the END, so
     * adding something never silently jumps the queue ahead of things you
     * already decided you wanted more.
     *
     * Plain integers with gaps, not fractional ranks: at this scale a swap
     * is two UPDATEs and "move to top" is one (min - 1), which needs no
     * rebalancing and no float drift. Values may go negative — that's fine,
     * only the relative order is meaningful.
     */
    position: integer("position").notNull().default(0),

    /*
     * Whose watchlist this is on.
     *
     * NULL means BOTH of you, and null is the default because that's the
     * common case — a shared list with occasional solo entries, not two
     * separate lists. Storing it as a nullable user reference rather than an
     * enum keeps it honest if the seeded names ever change, and means "just
     * Greg" is one row rather than a membership table where the default case
     * needs the most rows.
     */
    wantedByUserId: uuid("wanted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Free-text "why it's on the list" — e.g. "Dave keeps going on about it". */
    note: text("note"),
    /*
     * Favourite TV shows are monitored for new seasons. When TMDB reports a
     * season count higher than what's in the episodes table, the show's status
     * is moved back to "want" so it reappears on the watchlist automatically.
     * Films never get new seasons, so this flag is only meaningful for TV.
     */
    favourite: boolean("favourite").notNull().default(false),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("list_entries_status_idx").on(t.status),
    /* Drives the watchlist's default sort. */
    index("list_entries_position_idx").on(t.status, t.position),
    index("list_entries_wanted_by_idx").on(t.wantedByUserId),
  ],
);

/*
 * One row per person per thing watched.
 *
 * For TV, `episodeId` is set and this is one episode. For a FILM, `episodeId`
 * is NULL and the row means "watched the film" — films have no episodes, so
 * their tick is binary rather than a progress bar.
 *
 * The two partial unique indexes enforce one row per person per target for
 * each case separately, for the same NULL-is-never-equal-to-NULL reason as
 * the ratings table below.
 */
export const watches = pgTable(
  "watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Denormalised so per-title progress is one indexed lookup, no join. */
    titleId: uuid("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    /** Null for a film. */
    episodeId: uuid("episode_id").references(() => episodes.id, {
      onDelete: "cascade",
    }),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("watches_user_title_idx").on(t.userId, t.titleId),
    index("watches_title_idx").on(t.titleId),
    uniqueIndex("watches_one_per_user_per_film")
      .on(t.userId, t.titleId)
      .where(sql`${t.episodeId} IS NULL`),
    uniqueIndex("watches_one_per_user_per_episode")
      .on(t.userId, t.episodeId)
      .where(sql`${t.episodeId} IS NOT NULL`),
  ],
);

/*
 * Ratings in HALF-STAR UNITS as a smallint 1..10, i.e. 7 means 3.5 stars.
 * The ask was "out of 5"; storing halves costs nothing and means switching
 * the UI to half-star granularity later needs no migration. The integer also
 * avoids float-comparison grief when averaging.
 *
 * A rating targets either a whole title (episodeId null) or one episode.
 * The PARTIAL unique indexes enforce one rating per person per target: a
 * plain unique constraint cannot, because in SQL NULL is never equal to
 * NULL, so every title-level row would look distinct and duplicate freely.
 */
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: uuid("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episodes.id, {
      onDelete: "cascade",
    }),
    /** 1..10 = 0.5..5 stars. */
    stars: smallint("stars").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ratings_title_idx").on(t.titleId),
    uniqueIndex("ratings_one_per_user_per_title")
      .on(t.userId, t.titleId)
      .where(sql`${t.episodeId} IS NULL`),
    uniqueIndex("ratings_one_per_user_per_episode")
      .on(t.userId, t.episodeId)
      .where(sql`${t.episodeId} IS NOT NULL`),
  ],
);

export const recommendationSource = pgEnum("recommendation_source", [
  "claude",
  "tmdb_similar",
  "manual",
]);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titleId: uuid("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" })
      .unique(),
    source: recommendationSource("source").notNull(),
    /** Why this was suggested — shown to the user verbatim. */
    reason: text("reason").notNull(),
    /** Dismissed suggestions stay so they aren't proposed again. */
    dismissed: boolean("dismissed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recommendations_dismissed_idx").on(t.dismissed)],
);

/* Convenience types used across the query and action layers. */
export type Title = typeof titles.$inferSelect;
export type MediaType = Title["mediaType"];
export type ListStatus = (typeof listEntries.$inferSelect)["status"];
