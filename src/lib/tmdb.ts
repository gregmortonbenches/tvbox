/*
 * TMDB client, covering both TV series and films.
 *
 * Every function here is server-only — the access token must never reach the
 * browser, so nothing in this file may be imported from a "use client"
 * component, and the env var is deliberately NOT prefixed NEXT_PUBLIC_ (that
 * prefix inlines the value into the client bundle).
 *
 * TMDB numbers TV and films in SEPARATE sequences, so an id is meaningless
 * without knowing which. Every function here therefore takes a MediaType
 * alongside the id, and so does everything downstream of it.
 */
import "server-only";
import type { MediaType } from "./db/schema";

const BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

/** TMDB's own path segment for each media type. */
const SEGMENT: Record<MediaType, string> = { tv: "tv", film: "movie" };

const REVALIDATE = {
  trending: 60 * 60 * 6, // 6 hours
  detail: 60 * 60 * 24, // 1 day
  search: 60 * 10, // 10 minutes
} as const;

/*
 * TMDB's TV and movie payloads differ in field names for the same concepts:
 * `name`/`title` and `first_air_date`/`release_date`. Rather than leak that
 * split through the whole app, everything below normalises to one shape at
 * the boundary — see `normalise`.
 */
type RawTmdbResult = {
  id: number;
  name?: string;
  title?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date?: string | null;
  release_date?: string | null;
};

export type TitleSummary = {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
};

export type TitleDetail = TitleSummary & {
  status: string | null;
  genres: { id: number; name: string }[];
  /** TV only. */
  lastAirDate: string | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  seasons: { season_number: number; episode_count: number; name: string }[];
  /** Film only. */
  runtime: number | null;
};

export type TmdbEpisode = {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
};

class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

async function tmdb<T>(path: string, revalidate: number): Promise<T> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    throw new TmdbError(
      "TMDB_ACCESS_TOKEN is not set. Copy .env.example to .env.local and add your TMDB v4 read access token.",
      500,
    );
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    next: { revalidate },
  });

  if (!res.ok) {
    throw new TmdbError(`TMDB request failed: ${path}`, res.status);
  }
  return res.json() as Promise<T>;
}

/** Collapse TMDB's two payload shapes into one. */
function normalise(raw: RawTmdbResult, type: MediaType): TitleSummary {
  return {
    tmdbId: raw.id,
    mediaType: type,
    // A film uses `title`, a series uses `name`. Fall back rather than throw:
    // an untitled result is better than a crashed page.
    name: raw.title ?? raw.name ?? "Untitled",
    overview: raw.overview ?? "",
    posterPath: raw.poster_path,
    backdropPath: raw.backdrop_path,
    releaseDate: raw.release_date || raw.first_air_date || null,
  };
}

export async function searchTitles(
  query: string,
  type: MediaType,
): Promise<TitleSummary[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results: RawTmdbResult[] }>(
    `/search/${SEGMENT[type]}?query=${encodeURIComponent(query)}&include_adult=false`,
    REVALIDATE.search,
  );
  return data.results.map((r) => normalise(r, type));
}

/** Search both TV and film at once, interleaved by TMDB's own ranking. */
export async function searchEverything(query: string): Promise<TitleSummary[]> {
  if (!query.trim()) return [];
  const [tv, film] = await Promise.all([
    searchTitles(query, "tv"),
    searchTitles(query, "film"),
  ]);
  // TMDB returns each list already ranked; interleaving keeps the strongest
  // result of each type near the top rather than burying all films.
  const out: TitleSummary[] = [];
  for (let i = 0; i < Math.max(tv.length, film.length); i++) {
    if (tv[i]) out.push(tv[i]);
    if (film[i]) out.push(film[i]);
  }
  return out;
}

export async function getTrending(type: MediaType): Promise<TitleSummary[]> {
  const data = await tmdb<{ results: RawTmdbResult[] }>(
    `/trending/${SEGMENT[type]}/week`,
    REVALIDATE.trending,
  );
  return data.results.map((r) => normalise(r, type));
}

type RawDetail = RawTmdbResult & {
  status?: string;
  genres?: { id: number; name: string }[];
  last_air_date?: string | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: { season_number: number; episode_count: number; name: string }[];
  runtime?: number | null;
};

export async function getTitle(tmdbId: number, type: MediaType): Promise<TitleDetail> {
  const raw = await tmdb<RawDetail>(`/${SEGMENT[type]}/${tmdbId}`, REVALIDATE.detail);
  return {
    ...normalise(raw, type),
    status: raw.status ?? null,
    genres: raw.genres ?? [],
    lastAirDate: raw.last_air_date ?? null,
    numberOfSeasons: raw.number_of_seasons ?? null,
    numberOfEpisodes: raw.number_of_episodes ?? null,
    seasons: raw.seasons ?? [],
    runtime: raw.runtime ?? null,
  };
}

/** TV only — films have no seasons. */
export async function getSeason(
  tmdbId: number,
  seasonNumber: number,
): Promise<{ episodes: TmdbEpisode[] }> {
  return tmdb<{ episodes: TmdbEpisode[] }>(
    `/tv/${tmdbId}/season/${seasonNumber}`,
    REVALIDATE.detail,
  );
}

/** TMDB's own "more like this", used for the free recommendation fallback. */
export async function getSimilar(
  tmdbId: number,
  type: MediaType,
): Promise<TitleSummary[]> {
  const data = await tmdb<{ results: RawTmdbResult[] }>(
    `/${SEGMENT[type]}/${tmdbId}/recommendations`,
    REVALIDATE.detail,
  );
  return data.results.map((r) => normalise(r, type));
}

/* ---- Image helpers ------------------------------------------------------ */

export function posterUrl(path: string | null, size: "w342" | "w500" = "w342") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size: "w780" | "w1280" = "w1280") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function stillUrl(path: string | null) {
  return path ? `${IMAGE_BASE}/w300${path}` : null;
}
