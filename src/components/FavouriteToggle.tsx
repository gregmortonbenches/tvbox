"use client";

import { useOptimistic, useTransition } from "react";
import { setFavourite } from "@/lib/actions";

export function FavouriteToggle({
  titleId,
  favourite,
}: {
  titleId: string;
  favourite: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(favourite);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await setFavourite(titleId, !optimistic);
        })
      }
      aria-pressed={optimistic}
      title={optimistic ? "Remove from favourites" : "Mark as favourite — we'll add new seasons to your watchlist automatically"}
      className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        optimistic
          ? "border border-koji bg-koji/10 text-koji hover:bg-koji/20"
          : "border border-line text-ink-muted hover:border-koji hover:text-koji"
      }`}
    >
      <span aria-hidden className="text-base leading-none">{optimistic ? "★" : "☆"}</span>
      {optimistic ? "Favourite" : "Favourite"}
    </button>
  );
}
