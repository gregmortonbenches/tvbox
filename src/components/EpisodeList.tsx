"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleEpisode, toggleSeason } from "@/lib/actions";
import type { CurrentUser } from "@/lib/session";

export type EpisodeRow = {
  /** Internal uuid — what a watch row references. */
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  airDate: string | null;
  runtime: number | null;
};

/*
 * Episode ticking.
 *
 * Both people's state is visible on every row, but only the signed-in
 * person's dot is clickable — you can see that Hannah is three ahead
 * without being able to tick episodes on her behalf.
 *
 * Writes are optimistic: the dot fills instantly and the server action
 * reconciles. On failure React rolls the optimistic value back on its own,
 * and the next LiveRefresh poll re-syncs from the database regardless.
 */
export function EpisodeList({
  titleId,
  tmdbId,
  episodes,
  watchKeys,
  people,
  currentUserId,
}: {
  titleId: string;
  tmdbId: number;
  episodes: EpisodeRow[];
  watchKeys: string[];
  people: CurrentUser[];
  currentUserId: string;
}) {
  const [optimisticKeys, addOptimistic] = useOptimistic(
    new Set(watchKeys),
    (state: Set<string>, key: string) => {
      const next = new Set(state);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    },
  );
  const [, startTransition] = useTransition();

  const seasons = [...new Set(episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b);
  const [openSeason, setOpenSeason] = useState<number>(
    // Open the earliest season with anything unwatched — usually where you're up to.
    seasons.find((s) =>
      episodes.some(
        (e) => e.seasonNumber === s && !watchKeys.includes(`${currentUserId}:${e.id}`),
      ),
    ) ?? seasons[0] ?? 1,
  );

  function tick(episodeId: string) {
    const key = `${currentUserId}:${episodeId}`;
    startTransition(async () => {
      addOptimistic(key);
      await toggleEpisode(episodeId, titleId, tmdbId);
    });
  }

  function tickSeason(season: number, markWatched: boolean) {
    startTransition(async () => {
      await toggleSeason(titleId, tmdbId, season, markWatched);
    });
  }

  return (
    <div className="space-y-2">
      {seasons.map((season) => {
        const rows = episodes
          .filter((e) => e.seasonNumber === season)
          .sort((a, b) => a.episodeNumber - b.episodeNumber);
        const mineWatched = rows.filter((e) =>
          optimisticKeys.has(`${currentUserId}:${e.id}`),
        ).length;
        const allMine = mineWatched === rows.length && rows.length > 0;
        const isOpen = openSeason === season;

        return (
          <section key={season} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpenSeason(isOpen ? -1 : season)}
                className="flex flex-1 items-center gap-3 text-left"
                aria-expanded={isOpen}
              >
                <span
                  aria-hidden
                  className={`text-ink-faint transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                <span className="font-medium">
                  {season === 0 ? "Specials" : `Season ${season}`}
                </span>
                <span className="font-mono text-xs text-ink-faint">
                  {mineWatched}/{rows.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => tickSeason(season, !allMine)}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
              >
                {allMine ? "Unmark season" : "Mark season watched"}
              </button>
            </div>

            {isOpen && (
              <ul className="divide-y divide-line border-t border-line">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-10 shrink-0 font-mono text-xs text-ink-faint">
                      {season}×{String(e.episodeNumber).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {e.name ?? "—"}
                    </span>
                    {e.airDate && (
                      <span className="hidden shrink-0 font-mono text-[11px] text-ink-faint sm:block">
                        {e.airDate}
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-1.5">
                      {people.map((p) => {
                        const watched = optimisticKeys.has(`${p.id}:${e.id}`);
                        const isMe = p.id === currentUserId;
                        const label = `${p.displayName}: ${e.name ?? `episode ${e.episodeNumber}`} ${watched ? "watched" : "not watched"}`;
                        return isMe ? (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => tick(e.id)}
                            aria-label={label}
                            aria-pressed={watched}
                            title={`${p.displayName} (you)`}
                            className="size-4 rounded-full border-2 transition-all hover:scale-110"
                            style={{
                              borderColor: p.accentColor,
                              background: watched ? p.accentColor : "transparent",
                            }}
                          />
                        ) : (
                          <span
                            key={p.id}
                            title={`${p.displayName}: ${watched ? "watched" : "not watched"}`}
                            aria-label={label}
                            role="img"
                            className="size-4 rounded-full border-2"
                            style={{
                              borderColor: p.accentColor,
                              background: watched ? p.accentColor : "transparent",
                              opacity: watched ? 0.85 : 0.35,
                            }}
                          />
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
