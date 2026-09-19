"use client";

import { useOptimistic, useTransition } from "react";
import { addToWatchlist, removeFromList, setTitleStatus } from "@/lib/actions";
import type { ListStatus, MediaType } from "@/lib/db/schema";

/** A film has no "watching" state — you're either going to watch it or you have. */
const TV_OPTIONS: { value: ListStatus; label: string }[] = [
  { value: "want", label: "Want to watch" },
  { value: "watching", label: "Watching" },
  { value: "watched", label: "Watched" },
  { value: "dropped", label: "Gave up" },
];

const FILM_OPTIONS: { value: ListStatus; label: string }[] = [
  { value: "want", label: "Want to watch" },
  { value: "watched", label: "Watched" },
  { value: "dropped", label: "Gave up" },
];

export function StatusControl({
  titleId,
  mediaType,
  tmdbId,
  status,
}: {
  titleId: string | null;
  mediaType: MediaType;
  tmdbId: number;
  status: ListStatus | null;
}) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [, startTransition] = useTransition();

  if (optimistic === null || titleId === null) {
    return (
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            setOptimistic("want");
            await addToWatchlist(tmdbId, mediaType);
          })
        }
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-accent-strong hover:text-ink"
      >
        + Add to watchlist
      </button>
    );
  }

  const options = mediaType === "film" ? FILM_OPTIONS : TV_OPTIONS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => {
        const active = optimistic === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() =>
              startTransition(async () => {
                setOptimistic(o.value);
                await setTitleStatus(titleId, o.value, mediaType, tmdbId);
              })
            }
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              active
                ? "bg-accent text-canvas"
                : "border border-line text-ink-muted hover:border-ink-faint hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            setOptimistic(null);
            await removeFromList(titleId, mediaType, tmdbId);
          })
        }
        className="ml-1 text-xs text-ink-faint underline-offset-2 hover:text-suzume hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
