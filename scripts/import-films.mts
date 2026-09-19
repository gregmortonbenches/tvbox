/*
 * Import a hand-compiled Letterboxd watched list (data/letterboxd-films.txt).
 *
 *   npm run import:films -- --dry-run
 *   npm run import:films -- --user greg
 *
 * WHY THIS HAS A REVIEW STEP
 *
 * The source has no TMDB ids — just titles transcribed from screenshots. So
 * every entry has to be resolved by search, and a wrong match silently puts
 * the wrong film in your archive. Rather than guess, this script imports only
 * CONFIDENT matches and writes everything else to a review file for you to
 * correct by hand. Being short a few films is recoverable; a library quietly
 * full of wrong ones is not.
 *
 * A title resolves confidently when exactly one candidate's name matches it
 * exactly (after normalising case, accents and punctuation), and — if the
 * source gave a disambiguating year — the year matches too.
 *
 * It also catches TV series sitting in the film list (Chernobyl, Band of
 * Brothers, Small Axe and friends): anything that fails as a film but
 * resolves as a series is reported as such rather than dropped silently.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, isNull } from "drizzle-orm";
import { parseFilmList, type ParsedFilm } from "./parseFilmList.mts";
import { listEntries, ratings, titles, users, watches } from "../src/lib/db/schema.ts";

const SOURCE = "data/letterboxd-films.txt";
const REVIEW_OUT = "data/films-needs-review.json";
const TMDB = "https://api.themoviedb.org/3";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const USERNAME = valueOf("--user") ?? "greg";
const LIMIT = Number(valueOf("--limit") ?? "0") || Infinity;

function valueOf(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/**
 * Lowercase, strip accents and punctuation, collapse whitespace.
 *
 * Apostrophes are DELETED rather than turned into a space, so a title
 * transcribed without one still matches TMDB's version — "whos afraid of
 * virginia woolf" must equal "Who's Afraid of Virginia Woolf?". Turning them
 * into a space instead yields "who s ..." and silently sends real matches to
 * the review pile. This list came off screenshots, so that variance is
 * expected.
 */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type Candidate = {
  id: number;
  title: string;
  year: string | null;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
};

async function tmdb<T>(p: string): Promise<T> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) throw new Error("TMDB_ACCESS_TOKEN is not set.");
  const res = await fetch(`${TMDB}${p}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${p}`);
  return res.json() as Promise<T>;
}

async function searchFilms(q: string): Promise<Candidate[]> {
  const data = await tmdb<{ results: Record<string, unknown>[] }>(
    `/search/movie?query=${encodeURIComponent(q)}&include_adult=false`,
  );
  return data.results.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    year: ((r.release_date as string) || "").slice(0, 4) || null,
    overview: (r.overview as string) ?? "",
    poster_path: (r.poster_path as string) ?? null,
    backdrop_path: (r.backdrop_path as string) ?? null,
    release_date: ((r.release_date as string) || null),
  }));
}

async function looksLikeSeries(q: string): Promise<string | null> {
  const data = await tmdb<{ results: { name: string; first_air_date?: string }[] }>(
    `/search/tv?query=${encodeURIComponent(q)}`,
  );
  const hit = data.results.find((r) => normalise(r.name) === normalise(q));
  return hit ? `${hit.name}${hit.first_air_date ? ` (${hit.first_air_date.slice(0, 4)})` : ""}` : null;
}

export type Resolution =
  | { kind: "confident"; film: ParsedFilm; match: Candidate }
  | { kind: "ambiguous"; film: ParsedFilm; candidates: Candidate[] }
  | { kind: "is-series"; film: ParsedFilm; series: string }
  | { kind: "unresolved"; film: ParsedFilm; candidates: Candidate[] };

/*
 * The matching rule, as a PURE function so it can be tested without TMDB.
 * This is the safety-critical bit: anything it calls "confident" gets written
 * to the database unreviewed, so it errs towards sending things to review.
 *
 * Returns null when it wants the caller to check whether this is actually a
 * TV series before giving up.
 */
export function classify(
  film: ParsedFilm,
  candidates: Candidate[],
): Resolution | null {
  const want = normalise(film.title);
  const exact = candidates.filter((c) => normalise(c.title) === want);

  // A year hint in the source exists precisely to break these ties.
  if (film.year) {
    const byYear = exact.filter((c) => c.year === String(film.year));
    if (byYear.length === 1) return { kind: "confident", film, match: byYear[0] };
    // A year that matches nothing is a signal something is wrong, not a
    // licence to fall back to the unyeared match.
    return { kind: "ambiguous", film, candidates: (byYear.length ? byYear : exact).slice(0, 5) };
  }

  if (exact.length === 1) return { kind: "confident", film, match: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", film, candidates: exact.slice(0, 5) };
  return null; // no exact film match — caller checks for a series
}

async function resolve(film: ParsedFilm): Promise<Resolution> {
  const candidates = await searchFilms(film.title);
  const verdict = classify(film, candidates);
  if (verdict) return verdict;

  const series = await looksLikeSeries(film.title);
  if (series) return { kind: "is-series", film, series };

  return { kind: "unresolved", film, candidates: candidates.slice(0, 5) };
}

/** Resolve with bounded concurrency — TMDB is fine with this, but be polite. */
async function resolveAll(films: ParsedFilm[], concurrency = 8): Promise<Resolution[]> {
  const out: Resolution[] = new Array(films.length);
  let next = 0;
  let done = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= films.length) return;
      try {
        out[i] = await resolve(films[i]);
      } catch (err) {
        out[i] = { kind: "unresolved", film: films[i], candidates: [] };
        if (done < 3) console.error(`  ! ${films[i].title}: ${(err as Error).message}`);
      }
      done++;
      if (done % 50 === 0) process.stdout.write(`\r  resolved ${done}/${films.length}…`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stdout.write(`\r  resolved ${films.length}/${films.length}   \n`);
  return out;
}

async function main() {
  const raw = fs.readFileSync(SOURCE, "utf8");
  const all = parseFilmList(raw);
  const films = all.slice(0, LIMIT === Infinity ? undefined : LIMIT);

  console.log(`Parsed ${all.length} films from ${SOURCE}`);
  if (films.length !== all.length) console.log(`Limiting to first ${films.length}.`);
  console.log(`Resolving against TMDB (this takes a few minutes)…`);

  const results = await resolveAll(films);

  const confident = results.filter((r) => r.kind === "confident");
  const ambiguous = results.filter((r) => r.kind === "ambiguous");
  const series = results.filter((r) => r.kind === "is-series");
  const unresolved = results.filter((r) => r.kind === "unresolved");

  console.log();
  console.log(`  confident    ${confident.length}`);
  console.log(`  ambiguous    ${ambiguous.length}  (needs a year to disambiguate)`);
  console.log(`  is a series  ${series.length}  (in the film list by mistake)`);
  console.log(`  unresolved   ${unresolved.length}`);

  // Everything not imported goes to a file you can correct and re-run from.
  const review = {
    generatedAt: new Date().toISOString(),
    note: "Entries NOT imported. Add a disambiguating year to the source file, e.g. 'Crash (1996)', then re-run.",
    ambiguous: ambiguous.map((r) => ({
      title: r.film.title,
      section: r.film.section,
      candidates: r.candidates.map((c) => `${c.title} (${c.year ?? "?"}) [tmdb:${c.id}]`),
    })),
    looksLikeSeries: series.map((r) => ({ title: r.film.title, matchedSeries: r.series })),
    unresolved: unresolved.map((r) => ({
      title: r.film.title,
      section: r.film.section,
      nearest: r.candidates.map((c) => `${c.title} (${c.year ?? "?"}) [tmdb:${c.id}]`),
    })),
  };
  fs.mkdirSync(path.dirname(REVIEW_OUT), { recursive: true });
  fs.writeFileSync(REVIEW_OUT, JSON.stringify(review, null, 2));
  console.log(`\nWrote ${REVIEW_OUT} for the ${results.length - confident.length} not imported.`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written to the database.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const client = postgres(url, { max: 4 });
  const db = drizzle(client);

  const [user] = await db.select().from(users).where(eq(users.username, USERNAME)).limit(1);
  if (!user) throw new Error(`No such user: ${USERNAME}. Run npm run db:seed first.`);
  console.log(`\nImporting as ${user.displayName}…`);

  let imported = 0;
  let rated = 0;

  for (const r of confident) {
    if (r.kind !== "confident") continue;
    const c = r.match;

    const [title] = await db
      .insert(titles)
      .values({
        tmdbId: c.id,
        mediaType: "film",
        name: c.title,
        overview: c.overview,
        posterPath: c.poster_path,
        backdropPath: c.backdrop_path,
        releaseDate: c.release_date,
      })
      .onConflictDoUpdate({
        target: [titles.tmdbId, titles.mediaType],
        set: { name: c.title, cachedAt: new Date() },
      })
      .returning({ id: titles.id });

    await db
      .insert(listEntries)
      .values({
        titleId: title.id,
        status: "watched",
        addedByUserId: user.id,
        // Deliberately NOT stamping finishedAt: the source carries no watch
        // dates (Letterboxd grid order is by release date, not viewing), and
        // inventing one would make the archive lie about when you saw things.
      })
      .onConflictDoNothing({ target: listEntries.titleId });

    await db
      .insert(watches)
      .values({ userId: user.id, titleId: title.id })
      .onConflictDoNothing();

    if (r.film.stars) {
      await db
        .insert(ratings)
        .values({ userId: user.id, titleId: title.id, stars: r.film.stars })
        .onConflictDoUpdate({
          target: [ratings.userId, ratings.titleId],
          // Mirrors the ratings_one_per_user_per_title partial index predicate.
          targetWhere: isNull(ratings.episodeId),
          set: { stars: r.film.stars, updatedAt: new Date() },
        });
      rated++;
    }

    imported++;
    if (imported % 100 === 0) process.stdout.write(`\r  imported ${imported}/${confident.length}…`);
  }

  process.stdout.write(`\r  imported ${imported}/${confident.length}   \n`);
  console.log(`Done. ${imported} films, ${rated} with ratings, all as ${user.displayName}.`);
  await client.end();
}

// Only run when invoked directly — importing this module for tests must not
// kick off a full import.
if (process.argv[1]?.endsWith("import-films.mts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
