/*
 * Pure parsing for OMDb payloads.
 *
 * Split out from omdb.ts, which is `server-only` and therefore cannot be
 * imported by the backfill script or by tests. Everything here is a pure
 * function over a payload — no fetch, no env, no side effects — so both the
 * app and scripts/backfill-ratings.mts share ONE implementation of these
 * fiddly string formats rather than drifting copies.
 */

export type OmdbResponse = {
  Response: "True" | "False";
  Error?: string;
  imdbRating?: string;
  Metascore?: string;
  Ratings?: { Source: string; Value: string }[];
};

export type ExternalRatings = {
  /** Tomatometer, 0..100. */
  rtCritic: number | null;
  /** IMDb rating in TENTHS — 85 means 8.5. */
  imdbRating: number | null;
  /** Metacritic, 0..100. */
  metascore: number | null;
};

export const NO_RATINGS: ExternalRatings = {
  rtCritic: null,
  imdbRating: null,
  metascore: null,
};

/** "96%" -> 96. Anything else -> null. */
export function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,3})%$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

/** "87/100" or "87" -> 87. "N/A" -> null. */
export function parseOutOf100(value: string | undefined): number | null {
  if (!value || value === "N/A") return null;
  const n = Number(value.split("/")[0]);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

/** "8.5" -> 85 (tenths). "N/A" -> null. */
export function parseTenths(value: string | undefined): number | null {
  if (!value || value === "N/A") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 10) : null;
}

export function parseOmdb(payload: OmdbResponse): ExternalRatings {
  // OMDb answers HTTP 200 with Response:"False" for a miss, so the status
  // code alone never tells you whether there is data.
  if (payload.Response !== "True") return NO_RATINGS;

  const rt = payload.Ratings?.find((r) => r.Source === "Rotten Tomatoes");
  return {
    rtCritic: parsePercent(rt?.Value),
    imdbRating: parseTenths(payload.imdbRating),
    metascore: parseOutOf100(payload.Metascore),
  };
}

/** Does this error body mean "stop", rather than "this one title is missing"? */
export function classifyOmdbError(
  error: string | undefined,
): "rate-limited" | "bad-key" | "not-found" {
  if (/limit reached/i.test(error ?? "")) return "rate-limited";
  if (/invalid api key/i.test(error ?? "")) return "bad-key";
  return "not-found";
}
