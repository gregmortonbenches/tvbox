import "server-only";
import {
  classifyOmdbError,
  parseOmdb,
  type ExternalRatings,
  type OmdbResponse,
} from "./omdbParse";

export { parseOmdb, NO_RATINGS } from "./omdbParse";
export type { ExternalRatings } from "./omdbParse";

/*
 * OMDb client — the practical route to a Rotten Tomatoes score.
 *
 * WHY NOT ROTTEN TOMATOES DIRECTLY: RT has no self-serve API. Access runs
 * through the Fandango Developer Network as an approved-partner licence, at
 * a price no hobby project is paying. Scraping their site breaches their
 * terms and breaks constantly. OMDb republishes the Tomatometer, so that's
 * what this uses.
 *
 * WHAT YOU DO NOT GET: the RT AUDIENCE score. OMDb carries the critic
 * Tomatometer only. If the audience number ever matters more than the
 * critic one, MDBList is the provider to look at instead — it returns both,
 * plus a Letterboxd rating.
 *
 * COVERAGE: good for films, noticeably thinner for TV. A missing score is
 * normal and is not an error — see `ratingsFetchedAt` on the titles table
 * for how "looked up and found nothing" stays distinct from "never looked".
 *
 * Keyed on IMDb ids, not titles: an id lookup cannot mis-match, a title
 * search can.
 */

const BASE = "https://www.omdbapi.com/";

export class OmdbError extends Error {
  constructor(
    message: string,
    readonly kind: "no-key" | "not-found" | "rate-limited" | "http" | "bad-key",
  ) {
    super(message);
    this.name = "OmdbError";
  }
}

/**
 * Look up one title's ratings. Returns all-nulls when OMDb simply has
 * nothing, and throws only on problems worth stopping for (missing/invalid
 * key, rate limit, transport failure) so a backfill can tell the difference
 * between "no score exists" and "I should stop hammering this".
 */
export async function fetchRatings(imdbId: string): Promise<ExternalRatings> {
  const key = process.env.OMDB_API_KEY;
  if (!key) {
    throw new OmdbError(
      "OMDB_API_KEY is not set. Get a free key at https://www.omdbapi.com/apikey.aspx",
      "no-key",
    );
  }

  const res = await fetch(`${BASE}?i=${encodeURIComponent(imdbId)}&apikey=${key}`);

  if (res.status === 401) {
    throw new OmdbError("OMDB_API_KEY was rejected.", "bad-key");
  }
  if (res.status === 429) {
    throw new OmdbError("OMDb daily request limit reached.", "rate-limited");
  }
  if (!res.ok) {
    throw new OmdbError(`OMDb returned ${res.status}.`, "http");
  }

  const payload = (await res.json()) as OmdbResponse;

  // The free tier signals exhaustion in the body rather than the status code.
  if (payload.Response === "False") {
    const kind = classifyOmdbError(payload.Error);
    if (kind === "rate-limited") {
      throw new OmdbError("OMDb daily request limit reached.", "rate-limited");
    }
    if (kind === "bad-key") throw new OmdbError("OMDB_API_KEY was rejected.", "bad-key");
  }

  return parseOmdb(payload);
}
