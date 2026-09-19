/*
 * Database schema (Drizzle + Postgres).
 *
 * This is a PRIVATE two-person app — Greg and Hannah — not a public social
 * site. That shapes almost every decision below:
 *
 *   - `users` holds exactly two seeded rows. There is no sign-up flow, no
 *     follows/followers graph, no profile discovery.
 *   - The WATCHLIST IS SHARED. It's "things we want to watch", one list,
 *     so watchlist rows carry no user id — just who added it, for interest.
 *   - EPISODE WATCHES ARE PER-PERSON. They're attributed so the UI can show
 *     "both watched" vs "only Hannah has seen this one", which matters when
 *     one of you gets ahead of the other.
 *   - RATINGS ARE PER-PERSON, by explicit request ("we can each rate a
 *     show"). A show therefore has up to two ratings, shown side by side.
 *
 * TMDB is the source of truth for what exists (shows, seasons, episodes);
 * this database is the source of truth for what the two of you did about
 * it. `shows`/`episodes` are a local cache of TMDB keyed by TMDB's own ids
 * — no surrogate keys — so any row can be refreshed from upstream.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
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
  /** Used in URLs and the profile picker: "greg", "hannah". */
  username: varchar("username", { length: 32 }).notNull().unique(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  /** Hex colour so each person's ticks/ratings are visually distinct.
   *  Seeded from the project palette (koji for one, kamenozoki for the other). */
  accentColor: varchar("accent_color", { length: 7 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Local cache of a TMDB series. Primary key IS the TMDB id. */
export const shows = pgTable("shows", {
  tmdbId: integer("tmdb_id").primaryKey(),
  name: text("name").notNull(),
  overview: text("overview"),
  posterPath: text("poster_path"),
  backdropPath: text("backdrop_path"),
  firstAirDate: varchar("first_air_date", { length: 10 }),
  lastAirDate: varchar("last_air_date", { length: 10 }),
  status: varchar("status", { length: 32 }),
  numberOfSeasons: integer("number_of_seasons"),
  numberOfEpisodes: integer("number_of_episodes"),
  /** When we last pulled this row from TMDB — drives cache refresh. */
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Local cache of a TMDB episode. Primary key IS the TMDB episode id. */
export const episodes = pgTable(
  "episodes",
  {
    tmdbId: integer("tmdb_id").primaryKey(),
    showTmdbId: integer("show_tmdb_id")
      .notNull()
      .references(() => shows.tmdbId, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    name: text("name"),
    overview: text("overview"),
    stillPath: text("still_path"),
    airDate: varchar("air_date", { length: 10 }),
    runtime: integer("runtime"),
  },
  (t) => [
    index("episodes_show_idx").on(t.showTmdbId),
    unique("episodes_show_season_episode_key").on(
      t.showTmdbId,
      t.seasonNumber,
      t.episodeNumber,
    ),
  ],
);

/*
 * Where a show sits for the household. One row per show (NOT per user) —
 * the list is shared.
 *
 *   want     — on the watchlist, not started
 *   watching — in progress
 *   watched  — finished; this is what the Archive page lists
 *   dropped  — abandoned, kept so it stops being re-suggested
 *
 * Status is stored explicitly rather than computed from episode ticks.
 * Computing it sounds tidier but breaks constantly in practice: TMDB
 * episode counts shift as specials get added, so "all episodes ticked"
 * silently stops being true for shows you've definitely finished.
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
    showTmdbId: integer("show_tmdb_id")
      .primaryKey()
      .references(() => shows.tmdbId, { onDelete: "cascade" }),
    status: showStatus("status").notNull().default("want"),
    /** Who put it on the list — for "Hannah added this" niceties, not access control. */
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Free-text "why we want to watch this". */
    note: text("note"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when status moves to watched — drives Archive ordering. */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("list_entries_status_idx").on(t.status)],
);

/*
 * One row per person per episode watched. Ticking an episode in the UI
 * inserts here; un-ticking deletes. Unique per (user, episode) — this app
 * tracks "have we seen it", not a rewatch diary, so a second tick is a
 * no-op rather than a new row.
 */
export const watches = pgTable(
  "watches",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    episodeTmdbId: integer("episode_tmdb_id")
      .notNull()
      .references(() => episodes.tmdbId, { onDelete: "cascade" }),
    /** Denormalised so "episodes watched per show" is one indexed lookup
     *  instead of a join through `episodes` on every progress bar. */
    showTmdbId: integer("show_tmdb_id")
      .notNull()
      .references(() => shows.tmdbId, { onDelete: "cascade" }),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.episodeTmdbId] }),
    index("watches_user_show_idx").on(t.userId, t.showTmdbId),
    index("watches_show_idx").on(t.showTmdbId),
  ],
);

/*
 * Ratings are stored in HALF-STAR UNITS as a smallint 1..10, i.e. 7 means
 * 3.5 stars. The ask was "out of 5 stars"; storing halves costs nothing and
 * means switching the UI to half-star granularity later needs no migration.
 * The integer also avoids float-comparison grief when averaging.
 *
 * A rating targets either a whole show (episodeTmdbId null) or one episode.
 * The two PARTIAL unique indexes enforce one rating per person per target:
 * a plain unique constraint cannot, because in SQL NULL is never equal to
 * NULL, so every show-level row would look distinct and duplicate freely.
 */
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    showTmdbId: integer("show_tmdb_id")
      .notNull()
      .references(() => shows.tmdbId, { onDelete: "cascade" }),
    episodeTmdbId: integer("episode_tmdb_id").references(() => episodes.tmdbId, {
      onDelete: "cascade",
    }),
    /** 1..10 = 0.5..5 stars. */
    stars: smallint("stars").notNull(),
    /** Optional short note — the "letterboxd review", kept deliberately light. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ratings_show_idx").on(t.showTmdbId),
    uniqueIndex("ratings_one_per_user_per_show")
      .on(t.userId, t.showTmdbId)
      .where(sql`${t.episodeTmdbId} IS NULL`),
    uniqueIndex("ratings_one_per_user_per_episode")
      .on(t.userId, t.episodeTmdbId)
      .where(sql`${t.episodeTmdbId} IS NOT NULL`),
  ],
);

/*
 * Recommendations surfaced to the pair. `source` records where one came
 * from so the UI can label it honestly rather than presenting everything as
 * if a person picked it.
 */
export const recommendationSource = pgEnum("recommendation_source", [
  "claude",
  "tmdb_similar",
  "manual",
]);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    showTmdbId: integer("show_tmdb_id")
      .notNull()
      .references(() => shows.tmdbId, { onDelete: "cascade" }),
    source: recommendationSource("source").notNull(),
    /** Why this was suggested — shown to the user verbatim. */
    reason: text("reason").notNull(),
    /** Dismissed suggestions stay so they aren't proposed again. */
    dismissed: boolean("dismissed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recommendations_dismissed_idx").on(t.dismissed),
    unique("recommendations_one_per_show_key").on(t.showTmdbId),
  ],
);
