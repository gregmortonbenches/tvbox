/*
 * External ratings, rendered as small labelled numbers.
 *
 * Deliberately plain text rather than Rotten Tomatoes' tomato imagery: the
 * score is a fact we're citing, the splat graphics are their trademark. The
 * tint comes from this project's own palette, not RT's red/green.
 *
 * "Fresh" at 60 is RT's own threshold, so the colour break sits there.
 */
function tintFor(pct: number): string {
  if (pct >= 75) return "var(--color-koji)"; // well reviewed
  if (pct >= 60) return "var(--color-ink-muted)"; // fresh, unremarkable
  return "var(--color-suzume)"; // rotten
}

export function Scores({
  rtCritic,
  imdbRating,
  metascore,
  size = "sm",
}: {
  rtCritic: number | null;
  imdbRating: number | null;
  metascore: number | null;
  size?: "sm" | "md";
}) {
  if (rtCritic === null && imdbRating === null && metascore === null) return null;

  const text = size === "md" ? "text-xs" : "text-[10px]";

  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${text}`}>
      {rtCritic !== null && (
        <span
          className="font-mono font-medium"
          style={{ color: tintFor(rtCritic) }}
          title={`Rotten Tomatoes critic score: ${rtCritic}%`}
        >
          RT {rtCritic}%
        </span>
      )}
      {imdbRating !== null && (
        <span
          className="font-mono text-ink-faint"
          /* Stored in tenths — see the titles table comment. */
          title={`IMDb rating: ${(imdbRating / 10).toFixed(1)} out of 10`}
        >
          IMDb {(imdbRating / 10).toFixed(1)}
        </span>
      )}
      {metascore !== null && (
        <span className="font-mono text-ink-faint" title={`Metacritic: ${metascore}`}>
          MC {metascore}
        </span>
      )}
    </div>
  );
}
