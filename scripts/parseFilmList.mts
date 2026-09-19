/*
 * Parser for the hand-compiled Letterboxd list in data/letterboxd-films.txt.
 *
 * Format: `## Decade` headings, then comma-separated titles, each optionally
 * annotated `(★★★★½)`, `(♥)`, `(★★★★★, ♥)`, `(2004)` or `(rewatch)`.
 *
 * Two traps this has to avoid:
 *
 *   1. ANNOTATIONS CONTAIN COMMAS — `Yi Yi (★★★★★, ♥)` must not split into
 *      "Yi Yi (★★★★★" and "♥)". So splitting respects parenthesis depth.
 *   2. TITLES CAN CONTAIN COMMAS — "I, Tonya" and "One, Two, Three" would
 *      split into nonsense. There is no way to tell those from separators, so
 *      the source file has them written without the commas and this parser
 *      does NOT try to be clever about it. If you add a comma-containing
 *      title to the source, write it without the comma.
 *
 * The `## Decade` headings are parsed but DELIBERATELY NOT USED as a year
 * hint — they're unreliable in the source (Psycho is filed under 1950s,
 * Gladiator under 1990s), so trusting them would cause mis-resolution.
 */

export type ParsedFilm = {
  title: string;
  /** Half-star units 1..10, or null if no rating was legible on the tile. */
  stars: number | null;
  liked: boolean;
  /** Disambiguating year from an annotation like `(2004)`, if given. */
  year: number | null;
  rewatch: boolean;
  /** The section it appeared under, kept for reporting only. */
  section: string;
};

/** Split on commas at parenthesis depth zero. */
function splitTopLevel(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of line) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** `★★★★½` -> 9 (half-star units). */
function parseStars(text: string): number | null {
  const full = (text.match(/★/g) ?? []).length;
  if (full === 0) return null;
  const half = text.includes("½") ? 1 : 0;
  const value = full * 2 + half;
  return value >= 1 && value <= 10 ? value : null;
}

export function parseFilmList(raw: string): ParsedFilm[] {
  const films: ParsedFilm[] = [];
  let section = "unknown";

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("##")) {
      section = trimmed.replace(/^#+\s*/, "");
      continue;
    }
    if (trimmed.startsWith("#")) continue; // comment

    for (const entry of splitTopLevel(trimmed)) {
      // Pull every trailing annotation group off the end of the title.
      let title = entry;
      const annotations: string[] = [];
      for (;;) {
        const m = title.match(/\s*\(([^()]*)\)\s*$/);
        if (!m) break;
        annotations.unshift(m[1]);
        title = title.slice(0, m.index).trim();
      }
      if (!title) continue;

      const blob = annotations.join(", ");
      const yearMatch = blob.match(/\b(19|20)\d{2}\b/);

      films.push({
        title,
        stars: parseStars(blob),
        liked: blob.includes("♥"),
        year: yearMatch ? Number(yearMatch[0]) : null,
        rewatch: /rewatch/i.test(blob),
        section,
      });
    }
  }

  return films;
}
