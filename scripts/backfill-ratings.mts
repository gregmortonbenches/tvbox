/*
 * Fill in Rotten Tomatoes / IMDb / Metacritic scores for cached titles.
 *
 *   npm run backfill:ratings -- --dry-run
 *   npm run backfill:ratings
 *   npm run backfill:ratings -- --limit 200
 *   npm run backfill:ratings -- --refresh-after 90
 *
 * Designed around OMDb's FREE TIER (1,000 lookups/day). With ~1,360 titles
 * that's two days, so hitting the limit is an expected outcome, not a
 * failure: the script stops cleanly, tells you how many are left, and picks
 * up where it stopped when you run it again tomorrow.
 *
 * A title whose lookup succeeded but returned no scores is still stamped
 * with `ratingsFetchedAt`. Without that, every unrated title would be
 * re-queried on every run and the daily quota would go on the same misses
 * forever.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, isNull, lt, or, sql } from "drizzle-orm";
import { titles } from "../src/lib/db/schema.ts";
import { classifyOmdbError, parseOmdb, type OmdbResponse } from "../src/lib/omdbParse.ts";

const OMDB = "https://www.omdbapi.com/";
const TMDB = "https://api.themoviedb.org/3";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = Number(flag("--limit") ?? "0") || Infinity;
const REFRESH_AFTER_DAYS = Number(flag("--refresh-after") ?? "0") || 0;
/** Politeness gap between OMDb calls, ms. */
const DELAY_MS = 120;

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RateLimited extends Error {}

async function fetchRatings(imdbId: string, key: string) {
  const res = await fetch(`${OMDB}?i=${encodeURIComponent(imdbId)}&apikey=${key}`);
  if (res.status === 429) throw new RateLimited();
  if (res.status === 401) throw new Error("OMDB_API_KEY was rejected.");
  if (!res.ok) throw new Error(`OMDb returned ${res.status}`);

  const payload = (await res.json()) as OmdbResponse;
  // The free tier signals exhaustion in the body, not the status code.
  if (payload.Response === "False") {
    const kind = classifyOmdbError(payload.Error);
    if (kind === "rate-limited") throw new RateLimited();
    if (kind === "bad-key") throw new Error("OMDB_API_KEY was rejected.");
  }
  return parseOmdb(payload);
}

/** A title cached before imdb_id was captured needs one fetching from TMDB. */
async function fetchImdbId(tmdbId: number, mediaType: "tv" | "film", token: string) {
  const segment = mediaType === "film" ? "movie" : "tv";
  const res = await fetch(`${TMDB}/${segment}/${tmdbId}?append_to_response=external_ids`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const d = (await res.json()) as { imdb_id?: string; external_ids?: { imdb_id?: string } };
  return d.imdb_id || d.external_ids?.imdb_id || null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const omdbKey = process.env.OMDB_API_KEY;
  if (!omdbKey && !DRY_RUN) {
    throw new Error(
      "OMDB_API_KEY is not set. Free key: https://www.omdbapi.com/apikey.aspx",
    );
  }
  const tmdbToken = process.env.TMDB_ACCESS_TOKEN;

  const client = postgres(url, { max: 4 });
  const db = drizzle(client);

  // Never looked up, or looked up long enough ago to be worth refreshing.
  const staleBefore = REFRESH_AFTER_DAYS
    ? new Date(Date.now() - REFRESH_AFTER_DAYS * 86_400_000)
    : null;
  const needsWork = staleBefore
    ? or(isNull(titles.ratingsFetchedAt), lt(titles.ratingsFetchedAt, staleBefore))
    : isNull(titles.ratingsFetchedAt);

  const pending = await db
    .select({
      id: titles.id,
      tmdbId: titles.tmdbId,
      mediaType: titles.mediaType,
      name: titles.name,
      imdbId: titles.imdbId,
    })
    .from(titles)
    .where(needsWork);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(titles);

  console.log(`${total} titles cached, ${pending.length} needing a lookup.`);
  if (pending.length === 0) {
    console.log("Nothing to do.");
    await client.end();
    return;
  }

  const batch = pending.slice(0, LIMIT === Infinity ? undefined : LIMIT);
  if (batch.length !== pending.length) console.log(`Limiting to ${batch.length}.`);

  if (DRY_RUN) {
    const noImdb = batch.filter((t) => !t.imdbId).length;
    console.log(`\n--dry-run: would look up ${batch.length} titles.`);
    console.log(`  ${batch.length - noImdb} already have an IMDb id`);
    console.log(`  ${noImdb} need one fetching from TMDB first`);
    console.log(`\nOMDb free tier is 1,000/day, so this is ${Math.ceil(batch.length / 1000)} day(s).`);
    await client.end();
    return;
  }

  let done = 0, withRt = 0, noScores = 0, skipped = 0;
  let stoppedEarly = false;

  for (const title of batch) {
    let imdbId = title.imdbId;

    if (!imdbId) {
      if (!tmdbToken) { skipped++; continue; }
      imdbId = await fetchImdbId(title.tmdbId, title.mediaType, tmdbToken);
      if (imdbId) {
        await db.update(titles).set({ imdbId }).where(eq(titles.id, title.id));
      } else {
        // No IMDb id means OMDb can never answer for this one. Stamp it so
        // it stops coming back round on every run.
        await db
          .update(titles)
          .set({ ratingsFetchedAt: new Date() })
          .where(eq(titles.id, title.id));
        skipped++;
        continue;
      }
    }

    try {
      const ratings = await fetchRatings(imdbId, omdbKey!);
      await db
        .update(titles)
        .set({ ...ratings, ratingsFetchedAt: new Date() })
        .where(eq(titles.id, title.id));
      if (ratings.rtCritic !== null) withRt++;
      else noScores++;
    } catch (err) {
      if (err instanceof RateLimited) {
        stoppedEarly = true;
        break;
      }
      console.error(`\n  ! ${title.name}: ${(err as Error).message}`);
      // A bad key will fail on every title — don't burn the whole list on it.
      if ((err as Error).message.includes("rejected")) { stoppedEarly = true; break; }
    }

    done++;
    if (done % 25 === 0) process.stdout.write(`\r  ${done}/${batch.length} looked up…`);
    await sleep(DELAY_MS);
  }

  process.stdout.write(`\r  ${done}/${batch.length} looked up   \n`);
  console.log(`\n  with an RT score   ${withRt}`);
  console.log(`  no score found     ${noScores}`);
  console.log(`  skipped (no imdb)  ${skipped}`);

  if (stoppedEarly) {
    const left = pending.length - done - skipped;
    console.log(`\nStopped early — OMDb's daily limit. ${left} still to do.`);
    console.log(`Run the same command again tomorrow and it resumes where it left off.`);
  } else {
    console.log(`\nDone.`);
  }

  await client.end();
}

if (process.argv[1]?.endsWith("backfill-ratings.mts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
