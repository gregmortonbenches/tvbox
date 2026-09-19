import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { episodes, listEntries, ratings, recommendations, shows, users, watches } from "./db/schema";

export type ListStatus = (typeof listEntries.$inferSelect)["status"];

export type ShowCard = {
  tmdbId: number;
  name: string;
  posterPath: string | null;
  firstAirDate: string | null;
  status: ListStatus;
  addedAt: Date;
  finishedAt: Date | null;
  totalEpisodes: number;
  /** Episodes watched, keyed by user id. */
  watchedByUser: Record<string, number>;
  /** Show-level rating in half-stars (1..10), keyed by user id. */
  ratingByUser: Record<string, number>;
};

/**
 * Everything the poster grids need, in three queries rather than N+1.
 *
 * Episode totals come from `shows.numberOfEpisodes` (TMDB's own count) with
 * a fallback to however many episodes we've actually cached — a show that's
 * been added but never opened has no cached episodes yet, and showing 0/0
 * reads better than dividing by null.
 */
export async function getShowCards(statuses: ListStatus[]): Promise<ShowCard[]> {
  if (statuses.length === 0) return [];

  const entries = await db
    .select({
      tmdbId: shows.tmdbId,
      name: shows.name,
      posterPath: shows.posterPath,
      firstAirDate: shows.firstAirDate,
      numberOfEpisodes: shows.numberOfEpisodes,
      status: listEntries.status,
      addedAt: listEntries.addedAt,
      finishedAt: listEntries.finishedAt,
    })
    .from(listEntries)
    .innerJoin(shows, eq(shows.tmdbId, listEntries.showTmdbId))
    .where(inArray(listEntries.status, statuses))
    .orderBy(desc(listEntries.addedAt));

  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.tmdbId);

  const [watchRows, ratingRows, cachedCounts] = await Promise.all([
    db
      .select({
        showTmdbId: watches.showTmdbId,
        userId: watches.userId,
        n: sql<number>`count(*)::int`,
      })
      .from(watches)
      .where(inArray(watches.showTmdbId, ids))
      .groupBy(watches.showTmdbId, watches.userId),
    db
      .select({
        showTmdbId: ratings.showTmdbId,
        userId: ratings.userId,
        stars: ratings.stars,
      })
      .from(ratings)
      .where(and(inArray(ratings.showTmdbId, ids), isNull(ratings.episodeTmdbId))),
    db
      .select({
        showTmdbId: episodes.showTmdbId,
        n: sql<number>`count(*)::int`,
      })
      .from(episodes)
      .where(inArray(episodes.showTmdbId, ids))
      .groupBy(episodes.showTmdbId),
  ]);

  const cachedByShow = new Map(cachedCounts.map((r) => [r.showTmdbId, r.n]));

  return entries.map((e) => {
    const watchedByUser: Record<string, number> = {};
    for (const w of watchRows) {
      if (w.showTmdbId === e.tmdbId) watchedByUser[w.userId] = w.n;
    }
    const ratingByUser: Record<string, number> = {};
    for (const r of ratingRows) {
      if (r.showTmdbId === e.tmdbId) ratingByUser[r.userId] = r.stars;
    }
    return {
      tmdbId: e.tmdbId,
      name: e.name,
      posterPath: e.posterPath,
      firstAirDate: e.firstAirDate,
      status: e.status,
      addedAt: e.addedAt,
      finishedAt: e.finishedAt,
      totalEpisodes: e.numberOfEpisodes ?? cachedByShow.get(e.tmdbId) ?? 0,
      watchedByUser,
      ratingByUser,
    };
  });
}

/** The list entry for one show, or null if it isn't on the list yet. */
export async function getListEntry(showTmdbId: number) {
  const [row] = await db
    .select()
    .from(listEntries)
    .where(eq(listEntries.showTmdbId, showTmdbId))
    .limit(1);
  return row ?? null;
}

/** Every episode tick for one show, as a Set of `${userId}:${episodeId}`. */
export async function getWatchKeys(showTmdbId: number): Promise<Set<string>> {
  const rows = await db
    .select({ userId: watches.userId, episodeTmdbId: watches.episodeTmdbId })
    .from(watches)
    .where(eq(watches.showTmdbId, showTmdbId));
  return new Set(rows.map((r) => `${r.userId}:${r.episodeTmdbId}`));
}

/** Show-level ratings for one show, keyed by user id. */
export async function getShowRatings(showTmdbId: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ userId: ratings.userId, stars: ratings.stars })
    .from(ratings)
    .where(and(eq(ratings.showTmdbId, showTmdbId), isNull(ratings.episodeTmdbId)));
  return Object.fromEntries(rows.map((r) => [r.userId, r.stars]));
}

/** Undismissed recommendations, newest first, joined to their cached show. */
export async function getRecommendations() {
  return db
    .select({
      id: recommendations.id,
      reason: recommendations.reason,
      source: recommendations.source,
      createdAt: recommendations.createdAt,
      tmdbId: shows.tmdbId,
      name: shows.name,
      posterPath: shows.posterPath,
      firstAirDate: shows.firstAirDate,
      overview: shows.overview,
    })
    .from(recommendations)
    .innerJoin(shows, eq(shows.tmdbId, recommendations.showTmdbId))
    .where(eq(recommendations.dismissed, false))
    .orderBy(desc(recommendations.createdAt));
}

/** Highly-rated watched shows — the seed material for recommendations. */
export async function getTasteProfile() {
  return db
    .select({
      name: shows.name,
      tmdbId: shows.tmdbId,
      stars: ratings.stars,
      rater: users.displayName,
    })
    .from(ratings)
    .innerJoin(shows, eq(shows.tmdbId, ratings.showTmdbId))
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(isNull(ratings.episodeTmdbId))
    .orderBy(desc(ratings.stars));
}
