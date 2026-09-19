import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { episodes, shows } from "./db/schema";
import { getSeason, getShow, type TmdbShowDetail, type TmdbShowSummary } from "./tmdb";

/*
 * Mirrors TMDB rows into our tables.
 *
 * Why cache at all for a two-person app: every page that lists the watchlist
 * or archive needs a poster and a title for each show. Without a local copy
 * that's one TMDB round-trip per tile, which makes the grid slow and burns
 * rate limit for data that changes about twice a year. Foreign keys also
 * need the show row to exist before anything can reference it.
 */

/** Upsert the minimum needed to reference a show (list entry, rating, watch). */
export async function cacheShowSummary(show: TmdbShowSummary): Promise<void> {
  await db
    .insert(shows)
    .values({
      tmdbId: show.id,
      name: show.name,
      overview: show.overview,
      posterPath: show.poster_path,
      backdropPath: show.backdrop_path,
      firstAirDate: show.first_air_date || null,
    })
    .onConflictDoUpdate({
      target: shows.tmdbId,
      set: {
        name: show.name,
        overview: show.overview,
        posterPath: show.poster_path,
        backdropPath: show.backdrop_path,
        cachedAt: new Date(),
      },
    });
}

/** Upsert the full detail record, including season/episode counts. */
export async function cacheShowDetail(show: TmdbShowDetail): Promise<void> {
  await db
    .insert(shows)
    .values({
      tmdbId: show.id,
      name: show.name,
      overview: show.overview,
      posterPath: show.poster_path,
      backdropPath: show.backdrop_path,
      firstAirDate: show.first_air_date || null,
      lastAirDate: show.last_air_date || null,
      status: show.status,
      numberOfSeasons: show.number_of_seasons,
      numberOfEpisodes: show.number_of_episodes,
    })
    .onConflictDoUpdate({
      target: shows.tmdbId,
      set: {
        name: show.name,
        overview: show.overview,
        posterPath: show.poster_path,
        backdropPath: show.backdrop_path,
        lastAirDate: show.last_air_date || null,
        status: show.status,
        numberOfSeasons: show.number_of_seasons,
        numberOfEpisodes: show.number_of_episodes,
        cachedAt: new Date(),
      },
    });
}

/** Fetch a show from TMDB and cache it in one step. */
export async function ensureShowCached(tmdbId: number): Promise<TmdbShowDetail> {
  const detail = await getShow(tmdbId);
  await cacheShowDetail(detail);
  return detail;
}

/*
 * Cache every episode of one season.
 *
 * Season 0 is TMDB's "Specials" bucket. It's included deliberately — plenty
 * of shows put genuine episodes there (Doctor Who Christmas specials, for
 * one) and hiding them makes progress counts look wrong.
 */
export async function cacheSeasonEpisodes(
  showTmdbId: number,
  seasonNumber: number,
): Promise<void> {
  const season = await getSeason(showTmdbId, seasonNumber);
  if (!season.episodes?.length) return;

  await db
    .insert(episodes)
    .values(
      season.episodes.map((e) => ({
        tmdbId: e.id,
        showTmdbId,
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

/** How many episodes of this show we've cached locally. */
export async function cachedEpisodeCount(showTmdbId: number): Promise<number> {
  const rows = await db
    .select({ id: episodes.tmdbId })
    .from(episodes)
    .where(eq(episodes.showTmdbId, showTmdbId));
  return rows.length;
}
