"use client";

import { useOptimistic, useTransition } from "react";
import { addFavouriteDirector, removeFavouriteDirector } from "@/lib/actions";

export function DirectorFavouriteToggle({
  tmdbPersonId,
  name,
  isFavourite,
}: {
  tmdbPersonId: number;
  name: string;
  isFavourite: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(isFavourite);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          if (optimistic) {
            await removeFavouriteDirector(tmdbPersonId);
          } else {
            await addFavouriteDirector(tmdbPersonId, name);
          }
        })
      }
      aria-pressed={optimistic}
      title={
        optimistic
          ? `Unfollow ${name} — stop tracking new films`
          : `Follow ${name} — new films added to watchlist automatically`
      }
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
        optimistic
          ? "border border-koji bg-koji/10 text-koji hover:bg-koji/20"
          : "border border-line text-ink-faint hover:border-koji hover:text-koji"
      }`}
    >
      <span aria-hidden className="leading-none">{optimistic ? "★" : "☆"}</span>
      {name}
    </button>
  );
}
