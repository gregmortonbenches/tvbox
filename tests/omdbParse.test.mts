/*
 * Tests for OMDb payload parsing.
 *
 * The formats are fiddly and inconsistent ("96%", "8.5", "87/100", "N/A"),
 * and OMDb answers HTTP 200 for misses, so a parser bug shows up as silently
 * wrong scores rather than an error. Hence pinning them.
 *
 * Run with: npm test
 */
import {
  classifyOmdbError,
  parseOmdb,
  parseOutOf100,
  parsePercent,
  parseTenths,
  type OmdbResponse,
} from "../src/lib/omdbParse.ts";

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}: got ${g}, want ${w}`); }
}

/* A real-shaped success payload. */
const breakingBad: OmdbResponse = {
  Response: "True",
  imdbRating: "9.5",
  Metascore: "87",
  Ratings: [
    { Source: "Internet Movie Database", Value: "9.5/10" },
    { Source: "Rotten Tomatoes", Value: "96%" },
    { Source: "Metacritic", Value: "87/100" },
  ],
};

check("full payload", parseOmdb(breakingBad), { rtCritic: 96, imdbRating: 95, metascore: 87 });

check("a miss returns all nulls, not an error",
  parseOmdb({ Response: "False", Error: "Movie not found!" }),
  { rtCritic: null, imdbRating: null, metascore: null });

check("no Rotten Tomatoes entry leaves rtCritic null",
  parseOmdb({ Response: "True", imdbRating: "7.1", Metascore: "N/A",
    Ratings: [{ Source: "Internet Movie Database", Value: "7.1/10" }] }),
  { rtCritic: null, imdbRating: 71, metascore: null });

check("no Ratings array at all",
  parseOmdb({ Response: "True", imdbRating: "N/A", Metascore: "N/A" }),
  { rtCritic: null, imdbRating: null, metascore: null });

check("100% is valid", parsePercent("100%"), 100);
check("0% is valid and not confused with null", parsePercent("0%"), 0);
check("percent without sign rejected", parsePercent("96"), null);
check("percent out of range rejected", parsePercent("960%"), null);
check("N/A percent rejected", parsePercent("N/A"), null);

check("imdb rating to tenths", parseTenths("8.5"), 85);
check("whole imdb rating", parseTenths("9"), 90);
check("imdb 10.0", parseTenths("10.0"), 100);
check("imdb N/A", parseTenths("N/A"), null);
check("imdb out of range rejected", parseTenths("11"), null);

check("metascore bare", parseOutOf100("87"), 87);
check("metascore with denominator", parseOutOf100("87/100"), 87);
check("metascore N/A", parseOutOf100("N/A"), null);

/* The error body is the only signal that a free-tier day is spent. */
check("rate limit detected", classifyOmdbError("Request limit reached!"), "rate-limited");
check("bad key detected", classifyOmdbError("Invalid API key!"), "bad-key");
check("a plain miss is not a stop condition", classifyOmdbError("Movie not found!"), "not-found");
check("undefined error is not a stop condition", classifyOmdbError(undefined), "not-found");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
