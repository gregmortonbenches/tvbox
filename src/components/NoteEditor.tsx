"use client";

import { useState, useTransition } from "react";
import { setNote } from "@/lib/actions";
import type { MediaType } from "@/lib/db/schema";

/*
 * Why it's on the list — "Dave keeps going on about it", "for a rainy
 * Sunday", "the one with the boat".
 *
 * Saves on blur as well as on the button, because the commonest way to lose
 * a note is typing it and then clicking away.
 */
export function NoteEditor({
  titleId,
  mediaType,
  tmdbId,
  note,
}: {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  note: string | null;
}) {
  const [value, setValue] = useState(note ?? "");
  const [saved, setSaved] = useState<string>(note ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = value.trim() !== saved.trim();

  function save() {
    if (!dirty) return;
    startTransition(async () => {
      const next = value.trim();
      await setNote(titleId, next, mediaType, tmdbId);
      setSaved(next);
    });
  }

  return (
    <div>
      <label
        htmlFor={`note-${titleId}`}
        className="mb-2 block text-xs uppercase tracking-wider text-ink-faint"
      >
        Why it&rsquo;s on the list
      </label>
      <textarea
        id={`note-${titleId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={2}
        maxLength={500}
        placeholder="Recommended by…"
        className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-muted"
        >
          {pending ? "Saving…" : dirty ? "Save note" : "Saved"}
        </button>
        <span className="text-[11px] text-ink-faint">{value.length}/500</span>
      </div>
    </div>
  );
}
