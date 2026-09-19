"use client";

import { useOptimistic, useTransition } from "react";
import { addToWatchlist, removeFromList, setShowStatus } from "@/lib/actions";

type Status = "want" | "watching" | "watched" | "dropped";

const OPTIONS: { value: Status; label: string }[] = [
  { value: "want", label: "Want to watch" },
  { value: "watching", label: "Watching" },
  { value: "watched", label: "Watched" },
  { value: "dropped", label: "Gave up" },
];

export function StatusControl({
  tmdbId,
  status,
}: {
  tmdbId: number;
  status: Status | null;
}) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [, startTransition] = useTransition();

  if (optimistic === null) {
    return (
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            setOptimistic("want");
            await addToWatchlist(tmdbId);
          })
        }
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-accent-strong hover:text-ink"
      >
        + Add to watchlist
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPTIONS.map((o) => {
        const active = optimistic === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() =>
              startTransition(async () => {
                setOptimistic(o.value);
                await setShowStatus(tmdbId, o.value);
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
            await removeFromList(tmdbId);
          })
        }
        className="ml-1 text-xs text-ink-faint underline-offset-2 hover:text-suzume hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
