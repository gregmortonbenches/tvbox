/*
 * TMDB client. Every function here is server-only — the access token must
 * never reach the browser, so nothing in this file may be imported from a
 * "use client" component, and the env var is deliberately NOT prefixed
 * NEXT_PUBLIC_ (that prefix inlines the value into the client bundle).
 *
 * Auth uses TMDB's v4 read access token as a Bearer header, which is their
 * current recommendation over the older ?api_key= query param.
 */
import "server-only";

const BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

/** How long fetched TMDB responses stay fresh, in seconds. Show metadata
 *  barely moves, so this is generous; trending gets a shorter window. */
const REVALIDATE = {
  trending: 60 * 60 * 6, // 6 hours
  show: 60 * 60 * 24, // 1 day
  search: 60 * 10, // 10 minutes
} as const;

export type TmdbShowSummary = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  vote_average: number;
};

export type TmdbSeasonSummary = {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
};

export type TmdbShowDetail = TmdbShowSummary & {
  number_of_seasons: number;
  number_of_episodes: number;
  status: string;
  last_air_date: string | null;
  genres: { id: number; name: string }[];
  seasons: TmdbSeasonSummary[];
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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    next: { revalidate },
  });

  if (!res.ok) {
    // Deliberately does not echo the response body — TMDB error payloads are
    // harmless, but this keeps the habit of not spilling upstream detail.
    throw new TmdbError(`TMDB request failed: ${path}`, res.status);
  }

  return res.json() as Promise<T>;
}

export async function getTrendingShows(): Promise<TmdbShowSummary[]> {
  const data = await tmdb<{ results: TmdbShowSummary[] }>(
    "/trending/tv/week",
    REVALIDATE.trending,
  );
  return data.results;
}

export async function searchShows(query: string): Promise<TmdbShowSummary[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results: TmdbShowSummary[] }>(
    `/search/tv?query=${encodeURIComponent(query)}&include_adult=false`,
    REVALIDATE.search,
  );
  return data.results;
}

export async function getShow(id: number): Promise<TmdbShowDetail> {
  return tmdb<TmdbShowDetail>(`/tv/${id}`, REVALIDATE.show);
}

export async function getSeason(
  showId: number,
  seasonNumber: number,
): Promise<{ episodes: TmdbEpisode[] }> {
  return tmdb<{ episodes: TmdbEpisode[] }>(
    `/tv/${showId}/season/${seasonNumber}`,
    REVALIDATE.show,
  );
}

/* ---- Image helpers ------------------------------------------------------
 * TMDB serves images off a CDN at fixed widths. Passing a null path back as
 * null (rather than a broken URL) lets callers decide on a placeholder.
 */
export function posterUrl(path: string | null, size: "w342" | "w500" = "w342") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size: "w780" | "w1280" = "w1280") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function stillUrl(path: string | null) {
  return path ? `${IMAGE_BASE}/w300${path}` : null;
}
