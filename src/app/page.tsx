import Link from "next/link";
import { AppShell, EmptyState, PageHeading } from "@/components/AppShell";
import { PosterCard } from "@/components/PosterCard";
import { Walrus } from "@/components/Walrus";
import { getShowCards } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";

export default async function WatchlistPage() {
  const [user, people, cards] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getShowCards(["want", "watching"]),
  ]);

  const watching = cards.filter((c) => c.status === "watching");
  const want = cards.filter((c) => c.status === "want");

  return (
    <AppShell user={user}>
      <Walrus context={{ page: "watchlist", want: want.length, watching: watching.length }} />

      {watching.length > 0 && (
        <section className="mb-12">
          <PageHeading title="Carrying on" count={watching.length} />
          <Grid>
            {watching.map((show) => (
              <PosterCard key={show.tmdbId} show={show} people={people} />
            ))}
          </Grid>
        </section>
      )}

      <section>
        <PageHeading title="Want to watch" count={want.length} />
        {want.length === 0 && watching.length === 0 ? (
          <EmptyState
            title="Nothing on the list yet."
            hint="Search for a show up top and add it."
          />
        ) : want.length === 0 ? (
          <p className="text-sm text-ink-faint">
            All caught up —{" "}
            <Link href="/recommendations" className="text-link hover:underline">
              find something new
            </Link>
            .
          </p>
        ) : (
          <Grid>
            {want.map((show) => (
              <PosterCard key={show.tmdbId} show={show} people={people} showProgress={false} />
            ))}
          </Grid>
        )}
      </section>
    </AppShell>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {children}
    </div>
  );
}
