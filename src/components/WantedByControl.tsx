"use client";

import { useOptimistic, useTransition } from "react";
import { setWantedBy } from "@/lib/actions";
import type { CurrentUser } from "@/lib/session";
import type { MediaType } from "@/lib/db/schema";

/*
 * Whose watchlist this is on. Null means both of you — the default, and the
 * option listed first because it's the common case.
 */
export function WantedByControl({
  titleId,
  mediaType,
  tmdbId,
  wantedByUserId,
  people,
}: {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  wantedByUserId: string | null;
  people: CurrentUser[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(wantedByUserId);
  const [, startTransition] = useTransition();

  function pick(userId: string | null) {
    startTransition(async () => {
      setOptimistic(userId);
      await setWantedBy(titleId, userId, mediaType, tmdbId);
    });
  }

  const pill = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs transition-colors ${
      active
        ? "bg-accent text-canvas"
        : "border border-line text-ink-muted hover:border-ink-faint hover:text-ink"
    }`;

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Who wants to watch it</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={pill(optimistic === null)} onClick={() => pick(null)}>
          Both of us
        </button>
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            className={pill(optimistic === p.id)}
            onClick={() => pick(p.id)}
            style={optimistic === p.id ? { background: p.accentColor } : undefined}
          >
            Just {p.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
