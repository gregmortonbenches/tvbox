import "server-only";
import { and, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  episodes,
  listEntries,
  ratings,
  recommendations,
  titles,
  users,
  watches,
  type ListStatus,
  type MediaType,
} from "./db/schema";

export type { ListStatus, MediaType };

export type TitleCard = {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  posterPath: string | null;
  releaseDate: string | null;
  status: ListStatus;
  addedAt: Date;
  finishedAt: Date | null;
  /** TV only — 0 for films, which have no episodes. */
  totalEpisodes: number;
  /** TV: episodes watched. Film: 1 or 0, i.e. seen or not. */
  watchedByUser: Record<string, number>;
  /** Title-level rating in half-stars (1..10), keyed by user id. */
  ratingByUser: Record<string, number>;
  /** External scores — see lib/omdb.ts. Null until backfilled. */
  rtCritic: number | null;
  imdbRating: number | null;
  metascore: number | null;
};

/** The route a title lives at. TV and film ids come from separate sequences. */
export function titleHref(mediaType: MediaType, tmdbId: number): string {
  return `/${mediaType}/${tmdbId}`;
}

/**
 * Everything the poster grids need, in four queries rather than N+1.
 *
 * TV episode totals come from `titles.numberOfEpisodes` (TMDB's own count)
 * with a fallback to however many episodes we've actually cached — a series
 * added but never opened has none cached yet, and 0/0 reads better than
 * dividing by null. Films report 0 and render a seen/not-seen mark instead.
 */
export async function getTitleCards(
  statuses: ListStatus[],
  mediaTypes?: MediaType[],
): Promise<TitleCard[]> {
  if (statuses.length === 0) return [];

  const where = mediaTypes?.length
    ? and(inArray(listEntries.status, statuses), inArray(titles.mediaType, mediaTypes))
    : inArray(listEntries.status, statuses);

  const entries = await db
    .select({
      id: titles.id,
      tmdbId: titles.tmdbId,
      mediaType: titles.mediaType,
      name: titles.name,
      posterPath: titles.posterPath,
      releaseDate: titles.releaseDate,
      numberOfEpisodes: titles.numberOfEpisodes,
      rtCritic: titles.rtCritic,
      imdbRating: titles.imdbRating,
      metascore: titles.metascore,
      status: listEntries.status,
      addedAt: listEntries.addedAt,
      finishedAt: listEntries.finishedAt,
    })
    .from(listEntries)
    .innerJoin(titles, eq(titles.id, listEntries.titleId))
    .where(where)
    .orderBy(desc(listEntries.addedAt));

  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.id);

  const [watchRows, ratingRows, cachedCounts] = await Promise.all([
    db
      .select({
        titleId: watches.titleId,
        userId: watches.userId,
        n: sql<number>`count(*)::int`,
      })
      .from(watches)
      .where(inArray(watches.titleId, ids))
      .groupBy(watches.titleId, watches.userId),
    db
      .select({ titleId: ratings.titleId, userId: ratings.userId, stars: ratings.stars })
      .from(ratings)
      .where(and(inArray(ratings.titleId, ids), isNull(ratings.episodeId))),
    db
      .select({ titleId: episodes.titleId, n: sql<number>`count(*)::int` })
      .from(episodes)
      .where(inArray(episodes.titleId, ids))
      .groupBy(episodes.titleId),
  ]);

  const cachedByTitle = new Map(cachedCounts.map((r) => [r.titleId, r.n]));

  return entries.map((e) => {
    const watchedByUser: Record<string, number> = {};
    for (const w of watchRows) {
      if (w.titleId === e.id) watchedByUser[w.userId] = w.n;
    }
    const ratingByUser: Record<string, number> = {};
    for (const r of ratingRows) {
      if (r.titleId === e.id) ratingByUser[r.userId] = r.stars;
    }
    return {
      id: e.id,
      tmdbId: e.tmdbId,
      mediaType: e.mediaType,
      name: e.name,
      posterPath: e.posterPath,
      releaseDate: e.releaseDate,
      status: e.status,
      addedAt: e.addedAt,
      finishedAt: e.finishedAt,
      totalEpisodes:
        e.mediaType === "film" ? 0 : (e.numberOfEpisodes ?? cachedByTitle.get(e.id) ?? 0),
      watchedByUser,
      ratingByUser,
      rtCritic: e.rtCritic,
      imdbRating: e.imdbRating,
      metascore: e.metascore,
    };
  });
}

/** The list entry for one title, or null if it isn't on the list. */
export async function getListEntry(titleId: string) {
  const [row] = await db
    .select()
    .from(listEntries)
    .where(eq(listEntries.titleId, titleId))
    .limit(1);
  return row ?? null;
}

/** Episode ticks for one series, as a Set of `${userId}:${episodeId}`. */
export async function getWatchKeys(titleId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: watches.userId, episodeId: watches.episodeId })
    .from(watches)
    .where(and(eq(watches.titleId, titleId), isNotNull(watches.episodeId)));
  return new Set(rows.map((r) => `${r.userId}:${r.episodeId}`));
}

/** Which people have seen this FILM. Films have no episodes, so it's binary. */
export async function getFilmWatchers(titleId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: watches.userId })
    .from(watches)
    .where(and(eq(watches.titleId, titleId), isNull(watches.episodeId)));
  return new Set(rows.map((r) => r.userId));
}

/** Title-level ratings for one title, keyed by user id. */
export async function getTitleRatings(titleId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ userId: ratings.userId, stars: ratings.stars })
    .from(ratings)
    .where(and(eq(ratings.titleId, titleId), isNull(ratings.episodeId)));
  return Object.fromEntries(rows.map((r) => [r.userId, r.stars]));
}

/** Undismissed recommendations, newest first, joined to their cached title. */
export async function getRecommendations() {
  return db
    .select({
      id: recommendations.id,
      reason: recommendations.reason,
      source: recommendations.source,
      createdAt: recommendations.createdAt,
      titleId: titles.id,
      tmdbId: titles.tmdbId,
      mediaType: titles.mediaType,
      name: titles.name,
      posterPath: titles.posterPath,
      releaseDate: titles.releaseDate,
      overview: titles.overview,
    })
    .from(recommendations)
    .innerJoin(titles, eq(titles.id, recommendations.titleId))
    .where(eq(recommendations.dismissed, false))
    .orderBy(desc(recommendations.createdAt));
}

/** Rated titles — the seed material for recommendations. */
export async function getTasteProfile() {
  return db
    .select({
      titleId: titles.id,
      name: titles.name,
      tmdbId: titles.tmdbId,
      mediaType: titles.mediaType,
      stars: ratings.stars,
      rater: users.displayName,
    })
    .from(ratings)
    .innerJoin(titles, eq(titles.id, ratings.titleId))
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(isNull(ratings.episodeId))
    .orderBy(desc(ratings.stars));
}

/** How many of each media type sit in each status — drives the nav counts. */
export async function getListCounts() {
  const rows = await db
    .select({
      status: listEntries.status,
      mediaType: titles.mediaType,
      n: sql<number>`count(*)::int`,
    })
    .from(listEntries)
    .innerJoin(titles, eq(titles.id, listEntries.titleId))
    .groupBy(listEntries.status, titles.mediaType);
  return rows;
}
