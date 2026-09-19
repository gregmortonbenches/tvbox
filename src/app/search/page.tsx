import Image from "next/image";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { AppShell, EmptyState, PageHeading } from "@/components/AppShell";
import { AddButton } from "@/components/AddButton";
import { Walrus } from "@/components/Walrus";
import { db } from "@/lib/db";
import { listEntries } from "@/lib/db/schema";
import { posterUrl, searchShows } from "@/lib/tmdb";
import { getCurrentUser } from "@/lib/session";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const user = await getCurrentUser();
  const results = query ? await searchShows(query) : [];

  // One query to find which results are already on the list, rather than
  // one lookup per row.
  const onList = new Set<number>();
  if (results.length > 0) {
    const rows = await db
      .select({ showTmdbId: listEntries.showTmdbId })
      .from(listEntries)
      .where(inArray(listEntries.showTmdbId, results.map((r) => r.id)));
    for (const r of rows) onList.add(r.showTmdbId);
  }

  return (
    <AppShell user={user}>
      {query && (
        <Walrus context={{ page: "search", results: results.length, query }} />
      )}

      <PageHeading title={query ? `“${query}”` : "Search"} count={query ? results.length : undefined} />

      {!query ? (
        <EmptyState title="Search for a show." hint="Use the box in the top right." />
      ) : results.length === 0 ? (
        <EmptyState title="Nothing found." hint="Try a different spelling." />
      ) : (
        <ul className="divide-y divide-line">
          {results.map((show) => {
            const poster = posterUrl(show.poster_path, "w342");
            return (
              <li key={show.id} className="flex items-center gap-4 py-3">
                <Link
                  href={`/show/${show.id}`}
                  className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded border border-line bg-surface"
                >
                  {poster && (
                    <Image src={poster} alt="" fill sizes="56px" className="object-cover" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={`/show/${show.id}`} className="hover:text-accent">
                    <p className="truncate font-medium">{show.name}</p>
                  </Link>
                  <p className="text-xs text-ink-faint">
                    {show.first_air_date?.slice(0, 4) ?? "—"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{show.overview}</p>
                </div>

                <div className="shrink-0">
                  <AddButton tmdbId={show.id} alreadyOn={onList.has(show.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
