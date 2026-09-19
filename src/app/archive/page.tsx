import { AppShell, EmptyState, PageHeading } from "@/components/AppShell";
import { PosterCard } from "@/components/PosterCard";
import { Walrus } from "@/components/Walrus";
import { getShowCards } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";

export default async function ArchivePage() {
  const [user, people, cards] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getShowCards(["watched", "dropped"]),
  ]);

  const watched = cards
    .filter((c) => c.status === "watched")
    // Most recently finished first; anything missing a finish date (moved
    // straight to watched before that column existed) falls back to added.
    .sort(
      (a, b) =>
        (b.finishedAt ?? b.addedAt).getTime() - (a.finishedAt ?? a.addedAt).getTime(),
    );
  const dropped = cards.filter((c) => c.status === "dropped");

  return (
    <AppShell user={user}>
      <Walrus
        context={{ page: "archive", watched: watched.length, dropped: dropped.length }}
      />

      <section className="mb-12">
        <PageHeading title="Watched" count={watched.length} />
        {watched.length === 0 ? (
          <EmptyState
            title="Nothing archived yet."
            hint="Mark a show as watched and it lands here."
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {watched.map((show) => (
              <PosterCard key={show.tmdbId} show={show} people={people} showProgress={false} />
            ))}
          </div>
        )}
      </section>

      {dropped.length > 0 && (
        <section>
          <PageHeading title="Gave up on" count={dropped.length} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 opacity-50 transition-opacity hover:opacity-100 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {dropped.map((show) => (
              <PosterCard key={show.tmdbId} show={show} people={people} showProgress={false} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
