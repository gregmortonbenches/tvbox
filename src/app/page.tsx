import Link from "next/link";
import { AppShell, EmptyState, PageHeading } from "@/components/AppShell";
import { MediaFilter, parseMediaFilter } from "@/components/MediaFilter";
import { PosterCard } from "@/components/PosterCard";
import { SortableGrid } from "@/components/SortableGrid";
import { WhoFilter } from "@/components/WhoFilter";
import { getListCounts, getTitleCards, type TitleCard } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; who?: string }>;
}) {
  const { type, who } = await searchParams;
  const { current, mediaTypes } = parseMediaFilter(type);

  const [user, people, cards, counts] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getTitleCards(["want", "watching"], mediaTypes),
    getListCounts(),
  ]);

  /*
   * "Greg's list" means everything Greg could watch — the shared entries
   * plus his solo ones — not only his solo picks, which would be a much
   * less useful list.
   */
  const whoUser = who ? people.find((p) => p.username === who) : undefined;
  const visible = whoUser
    ? cards.filter((c) => c.wantedByUserId === null || c.wantedByUserId === whoUser.id)
    : cards;

  const open = counts.filter((c) => c.status === "want" || c.status === "watching");
  const tally = {
    tv: open.filter((c) => c.mediaType === "tv").reduce((a, c) => a + c.n, 0),
    film: open.filter((c) => c.mediaType === "film").reduce((a, c) => a + c.n, 0),
  };

  const watching = visible.filter((c) => c.status === "watching");
  const want = visible.filter((c) => c.status === "want");

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <MediaFilter basePath="/" current={current} counts={tally} />
        <WhoFilter
          basePath="/"
          current={whoUser?.username ?? null}
          people={people}
          extraParams={{ type: type }}
        />
      </div>

      {watching.length > 0 && (
        <section className="mb-12">
          <PageHeading title="Carrying on" count={watching.length} />
          <Queue titles={watching} people={people} />
        </section>
      )}

      <section>
        <PageHeading title="Want to watch" count={want.length} />
        {want.length === 0 && watching.length === 0 ? (
          <EmptyState
            title={whoUser ? `Nothing on ${whoUser.displayName}'s list.` : "Nothing on the list yet."}
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
          <SortableGrid titles={want} people={people} />
        )}
      </section>
    </AppShell>
  );
}

/*
 * The neighbour ids are worked out HERE, from what's actually rendered,
 * and handed to each card. Under a media or person filter the card above
 * isn't necessarily the row above in the database, so letting the server
 * guess would make the arrows move the wrong thing.
 */
function Queue({
  titles,
  people,
}: {
  titles: TitleCard[];
  people: Parameters<typeof PosterCard>[0]["people"];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {titles.map((title, i) => (
        <PosterCard
          key={title.id}
          title={title}
          people={people}
          showProgress={title.status === "watching"}
          rank={i + 1}
          prevId={i > 0 ? titles[i - 1].id : null}
          nextId={i < titles.length - 1 ? titles[i + 1].id : null}
        />
      ))}
    </div>
  );
}
