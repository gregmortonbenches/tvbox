"use client";

import { useState, useTransition } from "react";
import { refreshRecommendations } from "@/lib/actions";

/*
 * The ONLY thing in the app that can cost money — it's a deliberate button
 * press, never an automatic call on render or on the live-refresh poll.
 */
export function RefreshRecommendations() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {note && <span className="text-xs text-ink-faint">{note}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setNote(null);
            const result = await refreshRecommendations();
            setNote(
              result.note ??
                (result.added > 0
                  ? `Added ${result.added}.`
                  : "Nothing new to suggest just now."),
            );
          })
        }
        className="rounded-full border border-accent px-4 py-1.5 text-xs text-accent transition-colors hover:bg-accent hover:text-canvas disabled:opacity-60"
      >
        {pending ? "Thinking…" : "Find something"}
      </button>
    </div>
  );
}
