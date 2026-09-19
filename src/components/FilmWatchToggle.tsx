"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFilmWatched } from "@/lib/actions";

export function FilmWatchToggle({
  titleId,
  tmdbId,
  seen,
}: {
  titleId: string;
  tmdbId: number;
  seen: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(seen);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFilmWatched(titleId, tmdbId);
        })
      }
      aria-pressed={optimistic}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        optimistic
          ? "border border-accent text-accent hover:border-suzume hover:text-suzume"
          : "bg-accent text-canvas hover:bg-accent-strong hover:text-ink"
      }`}
    >
      {optimistic ? "✓ Seen it" : "Mark as seen"}
    </button>
  );
}
