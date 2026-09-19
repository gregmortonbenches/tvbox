"use client";

import { useState, useTransition } from "react";
import { addToWatchlist } from "@/lib/actions";

export function AddButton({ tmdbId, alreadyOn }: { tmdbId: number; alreadyOn: boolean }) {
  const [added, setAdded] = useState(alreadyOn);
  const [pending, startTransition] = useTransition();

  if (added) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink-faint">
        On the list
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setAdded(true);
          try {
            await addToWatchlist(tmdbId);
          } catch {
            setAdded(false); // put the button back if the write failed
          }
        })
      }
      className="rounded-full border border-accent px-3 py-1 text-xs text-accent transition-colors hover:bg-accent hover:text-canvas disabled:opacity-60"
    >
      {pending ? "…" : "+ Watchlist"}
    </button>
  );
}
