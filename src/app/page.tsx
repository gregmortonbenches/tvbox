import Link from "next/link";
import { AppShell, EmptyState, PageHeading } from "@/components/AppShell";
import { MediaFilter, parseMediaFilter } from "@/components/MediaFilter";
import { PosterCard } from "@/components/PosterCard";
import { Walrus } from "@/components/Walrus";
import { getListCounts, getTitleCards } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const { current, mediaTypes } = parseMediaFilter(type);

  const [user, people, cards, counts] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getTitleCards(["want", "watching"], mediaTypes),
    getListCounts(),
  ]);

  const open = counts.filter((c) => c.status === "want" || c.status === "watching");
  const tally = {
    tv: open.filter((c) => c.mediaType === "tv").reduce((a, c) => a + c.n, 0),
    film: open.filter((c) => c.mediaType === "film").reduce((a, c) => a + c.n, 0),
  };

  const watching = cards.filter((c) => c.status === "watching");
  const want = cards.filter((c) => c.status === "want");

  return (
    <AppShell user={user}>
      <Walrus context={{ page: "watchlist", want: want.length, watching: watching.length }} />

      {watching.length > 0 && (
        <section className="mb-12">
          <PageHeading title="Carrying on" count={watching.length}>
            <MediaFilter basePath="/" current={current} counts={tally} />
          </PageHeading>
          <Grid>
            {watching.map((title) => (
              <PosterCard key={title.id} title={title} people={people} />
            ))}
          </Grid>
        </section>
      )}

      <section>
        <PageHeading title="Want to watch" count={want.length}>
          {watching.length === 0 && (
            <MediaFilter basePath="/" current={current} counts={tally} />
          )}
        </PageHeading>

        {want.length === 0 && watching.length === 0 ? (
          <EmptyState
            title="Nothing on the list yet."
            hint="Search for something up top and add it."
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
            {want.map((title) => (
              <PosterCard key={title.id} title={title} people={people} showProgress={false} />
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
