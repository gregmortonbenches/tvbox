import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { episodes, titles, type MediaType } from "./db/schema";
import { getSeason, getTitle, type TitleDetail, type TitleSummary } from "./tmdb";

/*
 * Mirrors TMDB rows into our tables.
 *
 * Why cache: every grid needs a poster and a title per tile. Without a local
 * copy that's one TMDB round-trip per tile, which makes the grid slow and
 * burns rate limit on data that changes about twice a year. Foreign keys
 * also need the row to exist before anything can reference it.
 *
 * Every function here returns the INTERNAL uuid, not the TMDB id — callers
 * need it for foreign keys, and getting it back from the upsert's RETURNING
 * clause avoids a follow-up SELECT.
 */

/** Upsert the minimum needed to reference a title. Returns its internal id. */
export async function cacheTitleSummary(summary: TitleSummary): Promise<string> {
  const [row] = await db
    .insert(titles)
    .values({
      tmdbId: summary.tmdbId,
      mediaType: summary.mediaType,
      name: summary.name,
      overview: summary.overview,
      posterPath: summary.posterPath,
      backdropPath: summary.backdropPath,
      releaseDate: summary.releaseDate,
    })
    .onConflictDoUpdate({
      // The natural key is the PAIR — a tmdb_id alone collides across types.
      target: [titles.tmdbId, titles.mediaType],
      set: {
        name: summary.name,
        overview: summary.overview,
        posterPath: summary.posterPath,
        backdropPath: summary.backdropPath,
        cachedAt: new Date(),
      },
    })
    .returning({ id: titles.id });
  return row.id;
}

/** Upsert the full detail record. Returns its internal id. */
export async function cacheTitleDetail(detail: TitleDetail): Promise<string> {
  const [row] = await db
    .insert(titles)
    .values({
      tmdbId: detail.tmdbId,
      mediaType: detail.mediaType,
      name: detail.name,
      overview: detail.overview,
      posterPath: detail.posterPath,
      backdropPath: detail.backdropPath,
      releaseDate: detail.releaseDate,
      status: detail.status,
      lastAirDate: detail.lastAirDate,
      numberOfSeasons: detail.numberOfSeasons,
      numberOfEpisodes: detail.numberOfEpisodes,
      runtime: detail.runtime,
    })
    .onConflictDoUpdate({
      target: [titles.tmdbId, titles.mediaType],
      set: {
        name: detail.name,
        overview: detail.overview,
        posterPath: detail.posterPath,
        backdropPath: detail.backdropPath,
        status: detail.status,
        lastAirDate: detail.lastAirDate,
        numberOfSeasons: detail.numberOfSeasons,
        numberOfEpisodes: detail.numberOfEpisodes,
        runtime: detail.runtime,
        cachedAt: new Date(),
      },
    })
    .returning({ id: titles.id });
  return row.id;
}

/** Fetch from TMDB and cache in one step. Returns the detail and internal id. */
export async function ensureTitleCached(
  tmdbId: number,
  type: MediaType,
): Promise<{ detail: TitleDetail; titleId: string }> {
  const detail = await getTitle(tmdbId, type);
  const titleId = await cacheTitleDetail(detail);
  return { detail, titleId };
}

/** The internal id for a TMDB id, or null if we've never cached it. */
export async function findTitleId(
  tmdbId: number,
  type: MediaType,
): Promise<string | null> {
  const [row] = await db
    .select({ id: titles.id })
    .from(titles)
    .where(and(eq(titles.tmdbId, tmdbId), eq(titles.mediaType, type)))
    .limit(1);
  return row?.id ?? null;
}

/*
 * Cache every episode of one season. TV only.
 *
 * Season 0 is TMDB's "Specials" bucket. Included deliberately — plenty of
 * shows put genuine episodes there (Doctor Who Christmas specials, say) and
 * hiding them makes progress counts look wrong.
 */
export async function cacheSeasonEpisodes(
  titleId: string,
  tmdbId: number,
  seasonNumber: number,
): Promise<void> {
  const season = await getSeason(tmdbId, seasonNumber);
  if (!season.episodes?.length) return;

  await db
    .insert(episodes)
    .values(
      season.episodes.map((e) => ({
        tmdbId: e.id,
        titleId,
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        name: e.name,
        overview: e.overview,
        stillPath: e.still_path,
        airDate: e.air_date || null,
        runtime: e.runtime,
      })),
    )
    .onConflictDoUpdate({
      target: episodes.tmdbId,
      set: { name: episodes.name, airDate: episodes.airDate },
    });
}
