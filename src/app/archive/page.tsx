import { AppShell, EmptyState, PageHeading } from "@/components/AppShell";
import { MediaFilter, parseMediaFilter } from "@/components/MediaFilter";
import { PosterCard } from "@/components/PosterCard";
import { Walrus } from "@/components/Walrus";
import { getListCounts, getTitleCards } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const { current, mediaTypes } = parseMediaFilter(type);

  const [user, people, cards, counts] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getTitleCards(["watched", "dropped"], mediaTypes),
    getListCounts(),
  ]);

  const done = counts.filter((c) => c.status === "watched" || c.status === "dropped");
  const tally = {
    tv: done.filter((c) => c.mediaType === "tv").reduce((a, c) => a + c.n, 0),
    film: done.filter((c) => c.mediaType === "film").reduce((a, c) => a + c.n, 0),
  };

  const watched = cards
    .filter((c) => c.status === "watched")
    // Most recently finished first; anything without a finish date (imported,
    // or moved to watched before that column existed) falls back to added.
    .sort(
      (a, b) => (b.finishedAt ?? b.addedAt).getTime() - (a.finishedAt ?? a.addedAt).getTime(),
    );
  const dropped = cards.filter((c) => c.status === "dropped");

  return (
    <AppShell user={user}>
      <Walrus
        context={{
          page: "archive",
          watched: watched.length,
          dropped: dropped.length,
          films: tally.film,
        }}
      />

      <section className="mb-12">
        <PageHeading title="Watched" count={watched.length}>
          <MediaFilter basePath="/archive" current={current} counts={tally} />
        </PageHeading>
        {watched.length === 0 ? (
          <EmptyState
            title="Nothing archived yet."
            hint="Mark something as watched and it lands here."
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {watched.map((title) => (
              <PosterCard key={title.id} title={title} people={people} />
            ))}
          </div>
        )}
      </section>

      {dropped.length > 0 && (
        <section>
          <PageHeading title="Gave up on" count={dropped.length} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 opacity-50 transition-opacity hover:opacity-100 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {dropped.map((title) => (
              <PosterCard key={title.id} title={title} people={people} showProgress={false} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
