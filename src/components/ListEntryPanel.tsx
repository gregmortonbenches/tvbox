import { NoteEditor } from "./NoteEditor";
import { WantedByControl } from "./WantedByControl";
import type { CurrentUser } from "@/lib/session";
import type { listEntries, MediaType } from "@/lib/db/schema";

/*
 * The bits that only make sense once something is actually ON the list:
 * why it's there, and whose list it's on. Rendered on both /tv/[id] and
 * /film/[id]; hidden entirely when the title hasn't been added yet, because
 * there's no entry to attach either to.
 */
export function ListEntryPanel({
  entry,
  mediaType,
  tmdbId,
  people,
}: {
  entry: typeof listEntries.$inferSelect | null;
  mediaType: MediaType;
  tmdbId: number;
  people: CurrentUser[];
}) {
  if (!entry) return null;

  const addedBy = people.find((p) => p.id === entry.addedByUserId);

  return (
    <section className="mt-10 rounded-lg border border-line bg-surface p-5">
      <div className="grid gap-6 sm:grid-cols-2">
        <NoteEditor
          titleId={entry.titleId}
          mediaType={mediaType}
          tmdbId={tmdbId}
          note={entry.note}
        />
        <WantedByControl
          titleId={entry.titleId}
          mediaType={mediaType}
          tmdbId={tmdbId}
          wantedByUserId={entry.wantedByUserId}
          people={people}
        />
      </div>

      {addedBy && (
        <p className="mt-5 border-t border-line pt-3 text-xs text-ink-faint">
          Added by {addedBy.displayName} on{" "}
          {entry.addedAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
    </section>
  );
}
