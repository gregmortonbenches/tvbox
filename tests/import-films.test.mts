/*
 * Tests for the film importer's matching rule.
 *
 * This is the safety-critical bit of the import: anything `classify` calls
 * "confident" is written to the database unreviewed, so these cases pin down
 * that it errs towards the review pile rather than towards a wrong match.
 *
 * Run with: npm test
 */
import { classify, type Candidate } from "../scripts/import-films.mts";
import type { ParsedFilm } from "../scripts/parseFilmList.mts";

const film = (title: string, year: number | null = null): ParsedFilm =>
  ({ title, year, stars: null, liked: false, rewatch: false, section: "t" });
const cand = (title: string, year: string, id = 1): Candidate =>
  ({ id, title, year, overview: "", poster_path: null, backdrop_path: null, release_date: `${year}-01-01` });

let pass = 0, fail = 0;
function check(name: string, got: string, want: string) {
  if (got === want) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}: got ${got}, want ${want}`); }
}
const kind = (r: ReturnType<typeof classify>) => r === null ? "null" : r.kind;

check("single exact match is confident",
  kind(classify(film("Parasite"), [cand("Parasite","2019"), cand("Parasite Eve","1997",2)])), "confident");

check("two exact matches are ambiguous",
  kind(classify(film("Crash"), [cand("Crash","1996"), cand("Crash","2004",2)])), "ambiguous");

check("year hint resolves the ambiguity",
  kind(classify(film("Crash", 1996), [cand("Crash","1996"), cand("Crash","2004",2)])), "confident");

const pickedYear = classify(film("Crash", 2004), [cand("Crash", "1996", 11), cand("Crash", "2004", 22)]);
check("year hint picks the right one",
  pickedYear?.kind === "confident" && pickedYear.match.id === 22 ? "correct" : "wrong", "correct");

check("year matching nothing stays ambiguous, does not fall back",
  kind(classify(film("Crash", 1975), [cand("Crash","1996"), cand("Crash","2004",2)])), "ambiguous");

check("no exact match returns null so caller checks TV",
  kind(classify(film("Chernobyl"), [cand("Chernobyl Diaries","2012")])), "null");

check("case and punctuation are ignored",
  kind(classify(film("whos afraid of virginia woolf"), [cand("Who's Afraid of Virginia Woolf?","1966")])), "confident");

check("accents are ignored",
  kind(classify(film("Amelie"), [cand("Amélie","2001")])), "confident");

check("ampersand normalises to and",
  kind(classify(film("Stan and Ollie"), [cand("Stan & Ollie","2018")])), "confident");

check("empty candidate list returns null",
  kind(classify(film("Nonexistent Film"), [])), "null");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
