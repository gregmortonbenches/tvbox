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
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useTransition } from "react";
import { reorderList } from "@/lib/actions";
import { PosterCard } from "@/components/PosterCard";
import type { TitleCard } from "@/lib/queries";
import type { CurrentUser } from "@/lib/session";

function SortableItem({
  title,
  people,
  rank,
  prevId,
  nextId,
  showProgress,
}: {
  title: TitleCard;
  people: CurrentUser[];
  rank: number;
  prevId: string | null;
  nextId: string | null;
  showProgress: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: title.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag handle — small grip in the top-right corner of the poster */}
      <div
        {...attributes}
        {...listeners}
        className="absolute right-1.5 top-1.5 z-10 grid size-6 cursor-grab place-items-center rounded bg-canvas/80 text-ink-faint backdrop-blur-sm transition-opacity hover:text-ink active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
          <circle cx="3" cy="2" r="1" />
          <circle cx="7" cy="2" r="1" />
          <circle cx="3" cy="5" r="1" />
          <circle cx="7" cy="5" r="1" />
          <circle cx="3" cy="8" r="1" />
          <circle cx="7" cy="8" r="1" />
        </svg>
      </div>
      <PosterCard
        title={title}
        people={people}
        rank={rank}
        prevId={prevId}
        nextId={nextId}
        showProgress={showProgress}
      />
    </div>
  );
}

export function SortableGrid({
  titles,
  people,
  showProgress = false,
}: {
  titles: TitleCard[];
  people: CurrentUser[];
  showProgress?: boolean;
}) {
  const [ordered, setOrdered] = useState(titles);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = ordered.findIndex((t) => t.id === active.id);
    const newIndex = ordered.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = [...ordered];
    next.splice(newIndex, 0, next.splice(oldIndex, 1)[0]);
    setOrdered(next);

    startTransition(async () => {
      await reorderList(next.map((t) => t.id));
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ordered.map((t) => t.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {ordered.map((title, i) => (
            <SortableItem
              key={title.id}
              title={title}
              people={people}
              rank={i + 1}
              prevId={i > 0 ? ordered[i - 1].id : null}
              nextId={i < ordered.length - 1 ? ordered[i + 1].id : null}
              showProgress={showProgress}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
