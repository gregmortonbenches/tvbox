/*
 * Tests for the Letterboxd list parser. The two failure modes that matter:
 * commas inside annotations splitting a title, and annotations not being
 * stripped off the title text.
 *
 * Run with: npm test
 */
import { parseFilmList } from "../scripts/parseFilmList.mts";

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}: got ${g}, want ${w}`); }
}

const one = (line: string) => parseFilmList(line)[0];

check("plain title", one("Parasite").title, "Parasite");
check("stars parsed", one("Parasite (★★★★★)").stars, 10);
check("half star parsed", one("About Time (★★★★½)").stars, 9);
check("four stars", one("Frank (★★★★)").stars, 8);
check("no rating is null", one("Parasite").stars, null);
check("liked flag", one("Brief Encounter (♥)").liked, true);

// The trap: the annotation itself contains a comma.
check("comma inside annotation does not split", parseFilmList("Yi Yi (★★★★★, ♥)").length, 1);
check("title survives comma annotation", one("Yi Yi (★★★★★, ♥)").title, "Yi Yi");
check("stars survive comma annotation", one("Yi Yi (★★★★★, ♥)").stars, 10);
check("liked survives comma annotation", one("Yi Yi (★★★★★, ♥)").liked, true);

check("year hint parsed", one("Around the World in 80 Days (2004)").year, 2004);
check("rewatch flag", one("The Boy and the Heron (rewatch)").rewatch, true);
check("title keeps its own colon", one("Mission: Impossible Fallout").title, "Mission: Impossible Fallout");
check("commas do separate entries", parseFilmList("Alien, Aliens, Alien Romulus").length, 3);
check("headings are skipped", parseFilmList("## 1990s\nFargo").length, 1);
check("comments are skipped", parseFilmList("# a note\nFargo").length, 1);
check("section recorded", one("## 1990s\nFargo").section, "1990s");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
