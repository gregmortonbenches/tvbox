"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { reorderList } from "@/lib/actions";
import { Scores } from "@/components/Scores";
import type { TitleCard } from "@/lib/queries";
import type { CurrentUser } from "@/lib/session";
import { posterUrl, titleHref } from "@/lib/urls";

/*
 * The want-list as a winding path, top = watch next. Rank is the whole point
 * of this list, and a grid buries it: you have to read numbers to know what
 * comes before what. On a path, "earlier" is simply "higher up".
 *
 * Layout is arithmetic, not measurement: every row is ROW_H tall and a row's
 * horizontal offset comes from its index, so the connecting line can be drawn
 * as one SVG from the same numbers. That is also why the track has a fixed
 * width — it keeps the SVG and the nodes in the same coordinate space.
 */
const TRACK_W = 320;
const NODE = 76;
const ROW_H = 128;
const POPOVER_W = 224;
/** Horizontal swing per row, cycling — the same wobble Duolingo uses. */
const OFFSETS = [0, 44, 66, 44, 0, -44, -66, -44];

const offsetFor = (i: number) => OFFSETS[i % OFFSETS.length];

function PathLine({ count }: { count: number }) {
  if (count < 2) return null;
  const pts = Array.from({ length: count }, (_, i) => ({
    x: TRACK_W / 2 + offsetFor(i),
    y: i * ROW_H + NODE / 2,
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mid = (pts[i - 1].y + pts[i].y) / 2;
    d += ` C ${pts[i - 1].x} ${mid}, ${pts[i].x} ${mid}, ${pts[i].x} ${pts[i].y}`;
  }
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-full w-full"
      viewBox={`0 0 ${TRACK_W} ${count * ROW_H}`}
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="1 11"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Callback-only move buttons; the parent owns the ordering and the server call. */
function MoveButtons({
  canMoveUp,
  canMoveDown,
  pending,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  pending?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToTop: () => void;
}) {
  if (!canMoveUp && !canMoveDown) return null;

  const base =
    "flex flex-1 touch-manipulation min-h-[44px] items-center justify-center rounded border border-line text-sm leading-none text-ink-faint transition-colors active:scale-95 hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink-faint";

  return (
    <div className="flex w-full gap-1">
      <button type="button" className={base} disabled={pending || !canMoveUp} aria-label="Move up the queue" title="Move up" onClick={onMoveUp}>
        <span aria-hidden>↑</span>
      </button>
      <button type="button" className={base} disabled={pending || !canMoveDown} aria-label="Move down the queue" title="Move down" onClick={onMoveDown}>
        <span aria-hidden>↓</span>
      </button>
      <button type="button" className={base} disabled={pending || !canMoveUp} aria-label="Move to the top of the queue" title="Watch this next" onClick={onMoveToTop}>
        <span aria-hidden>⤒</span>
      </button>
    </div>
  );
}

function PathNode({
  title,
  people,
  index,
  total,
  selected,
  movePending,
  onSelect,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
}: {
  title: TitleCard;
  people: CurrentUser[];
  index: number;
  total: number;
  selected: boolean;
  movePending: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToTop: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: title.id,
  });

  const poster = posterUrl(title.posterPath);
  const year = title.releaseDate?.slice(0, 4);
  const isFilm = title.mediaType === "film";
  const soloWanter = title.wantedByUserId
    ? people.find((p) => p.id === title.wantedByUserId)
    : null;
  /** A solo pick gets its person's colour as the ring; shared ones stay neutral. */
  const ring = soloWanter?.accentColor ?? "var(--color-line)";

  const centre = TRACK_W / 2 + offsetFor(index);
  const popoverLeft = Math.min(Math.max(centre - POPOVER_W / 2, -8), TRACK_W - POPOVER_W + 8);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        height: ROW_H,
        zIndex: isDragging ? 40 : selected ? 30 : undefined,
      }}
      className="relative"
    >
      <div
        className="absolute top-0 -translate-x-1/2"
        style={{ left: `calc(50% + ${offsetFor(index)}px)`, width: NODE }}
      >
        {index === 0 && (
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-accent bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
            Next up
          </span>
        )}

        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-label={`Number ${index + 1}: ${title.name}. Tap for options, hold and drag to reorder.`}
          aria-expanded={selected}
          className={`relative block touch-manipulation overflow-hidden rounded-full border-4 bg-surface transition-transform active:scale-95 ${
            isDragging ? "scale-110 cursor-grabbing opacity-80" : "cursor-pointer"
          }`}
          style={{
            width: NODE,
            height: NODE,
            borderColor: selected ? "var(--color-accent)" : ring,
            boxShadow: `0 4px 0 ${selected ? "var(--color-accent-strong)" : "var(--color-line)"}`,
          }}
        >
          {poster ? (
            <Image
              src={poster}
              alt=""
              fill
              sizes="76px"
              draggable={false}
              className="pointer-events-none object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center p-1 text-center text-[10px] leading-tight text-ink-faint">
              {title.name}
            </span>
          )}
        </button>

        <span
          className="pointer-events-none absolute -left-1 bottom-1 grid min-w-6 place-items-center rounded-full border border-line bg-canvas px-1 py-0.5 font-mono text-xs font-semibold tabular-nums text-accent"
          aria-hidden
        >
          {index + 1}
        </span>
        {title.favourite && (
          <span
            className="pointer-events-none absolute -right-1 top-0 grid size-5 place-items-center rounded-full bg-koji text-[11px] leading-none text-canvas"
            title="Favourite — new seasons added to watchlist automatically"
            aria-hidden
          >
            ★
          </span>
        )}

        <div className="absolute left-1/2 mt-2 w-32 -translate-x-1/2 text-center">
          <p className="line-clamp-2 text-xs font-medium leading-tight text-ink">{title.name}</p>
          <p className="text-[10px] text-ink-faint">
            {[year, isFilm ? "Film" : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {selected && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-10 space-y-2 rounded-lg border border-line bg-canvas p-3 shadow-lg shadow-black/20"
          style={{ top: NODE + 10, left: popoverLeft, width: POPOVER_W }}
        >
          <Link href={titleHref(title.mediaType, title.tmdbId)} className="block">
            <p className="text-sm font-semibold leading-tight text-ink">{title.name}</p>
            <p className="text-xs text-ink-faint">
              {[year, isFilm ? "Film" : "TV"].filter(Boolean).join(" · ")}
              <span className="ml-2 text-link">Open →</span>
            </p>
          </Link>

          {soloWanter && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
              style={{ borderColor: soloWanter.accentColor, color: soloWanter.accentColor }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: soloWanter.accentColor }}
              />
              {soloWanter.displayName} only
            </span>
          )}

          {title.note && (
            <p className="line-clamp-3 text-xs italic leading-snug text-ink-muted">{title.note}</p>
          )}

          <Scores
            rtCritic={title.rtCritic}
            imdbRating={title.imdbRating}
            metascore={title.metascore}
          />

          <MoveButtons
            canMoveUp={index > 0}
            canMoveDown={index < total - 1}
            pending={movePending}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onMoveToTop={onMoveToTop}
          />
        </div>
      )}
    </div>
  );
}

export function WatchPath({ titles, people }: { titles: TitleCard[]; people: CurrentUser[] }) {
  const [ordered, setOrdered] = useState(titles);
  const [seen, setSeen] = useState(titles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movePending, startTransition] = useTransition();
  /** Rows the page should scroll after the next reorder, so a moved node stays under the finger. */
  const pendingScroll = useRef(0);

  /*
   * Adopt a new server order (the other person reordered, or an add/remove
   * arrived via LiveRefresh) without clobbering our optimistic state on every
   * render. Comparing prop identity is enough: it changes only on a refetch.
   */
  if (titles !== seen) {
    setSeen(titles);
    setOrdered(titles);
  }

  useLayoutEffect(() => {
    if (pendingScroll.current) {
      window.scrollBy(0, pendingScroll.current);
      pendingScroll.current = 0;
    }
  }, [ordered]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  function applyOrder(next: TitleCard[], movedFrom?: number, movedTo?: number) {
    if (movedFrom !== undefined && movedTo !== undefined) {
      pendingScroll.current = (movedTo - movedFrom) * ROW_H;
    }
    setOrdered(next);
    startTransition(async () => {
      await reorderList(next.map((t) => t.id));
    });
  }

  function moveTo(id: string, to: number) {
    const from = ordered.findIndex((t) => t.id === id);
    if (from === -1 || to < 0 || to >= ordered.length || from === to) return;
    const next = [...ordered];
    next.splice(to, 0, next.splice(from, 1)[0]);
    applyOrder(next, from, to);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const to = ordered.findIndex((t) => t.id === over.id);
    if (to === -1) return;
    const from = ordered.findIndex((t) => t.id === active.id);
    const next = [...ordered];
    next.splice(to, 0, next.splice(from, 1)[0]);
    applyOrder(next);
  }

  return (
    <div>
      <p className="mb-8 text-center text-xs text-ink-faint">
        Top of the path is what you watch next. Tap a title for options, or hold and drag it to
        reorder.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setSelectedId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ordered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {/* Clicking the empty track dismisses the open popover. */}
          <div
            onClick={() => setSelectedId(null)}
            className="relative mx-auto w-full pb-72 pt-8"
            style={{ maxWidth: TRACK_W }}
          >
            <div className="relative">
              <PathLine count={ordered.length} />
              {ordered.map((title, i) => (
                <PathNode
                  key={title.id}
                  title={title}
                  people={people}
                  index={i}
                  total={ordered.length}
                  selected={selectedId === title.id}
                  movePending={movePending}
                  onSelect={() => setSelectedId((cur) => (cur === title.id ? null : title.id))}
                  onMoveUp={() => moveTo(title.id, i - 1)}
                  onMoveDown={() => moveTo(title.id, i + 1)}
                  onMoveToTop={() => moveTo(title.id, 0)}
                />
              ))}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
