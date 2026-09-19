"use client";

import { useTransition } from "react";
import { moveToTop, swapPriority } from "@/lib/actions";

/*
 * Reordering the queue.
 *
 * Buttons rather than drag-and-drop, deliberately: this gets used on phones
 * from the sofa, and native HTML5 drag doesn't work on touch at all. Buttons
 * work everywhere, are keyboard-reachable and need no library. "To top"
 * carries the weight drag would otherwise do — the common move is "let's
 * watch this next", not nudging something three places.
 *
 * The neighbour ids come from the PARENT, which knows what's actually
 * rendered. Under a TV/film filter the card above may not be the row above
 * in the database, and asking the server to guess would make the arrows lie.
 */
export function PriorityControls({
  titleId,
  prevId,
  nextId,
}: {
  titleId: string;
  prevId: string | null;
  nextId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  // Nothing to reorder against.
  if (!prevId && !nextId) return null;

  /*
   * 28px rather than 24: this gets used with thumbs on a phone, where a
   * 24px target in a two-column grid is a miss waiting to happen. Still
   * under the 44px ideal, but a poster grid can't spare that much — the gap
   * between them does the rest of the work.
   */
  const base =
    "grid size-7 place-items-center rounded border border-line text-ink-faint transition-colors hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink-faint";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={base}
        disabled={pending || !prevId}
        aria-label="Move up the queue"
        title="Move up"
        onClick={() =>
          prevId && startTransition(() => swapPriority(titleId, prevId).then(() => {}))
        }
      >
        <span aria-hidden className="text-xs leading-none">↑</span>
      </button>

      <button
        type="button"
        className={base}
        disabled={pending || !nextId}
        aria-label="Move down the queue"
        title="Move down"
        onClick={() =>
          nextId && startTransition(() => swapPriority(titleId, nextId).then(() => {}))
        }
      >
        <span aria-hidden className="text-xs leading-none">↓</span>
      </button>

      <button
        type="button"
        className={base}
        disabled={pending || !prevId}
        aria-label="Move to the top of the queue"
        title="Watch this next"
        onClick={() => startTransition(() => moveToTop(titleId).then(() => {}))}
      >
        <span aria-hidden className="text-xs leading-none">⤒</span>
      </button>
    </div>
  );
}
