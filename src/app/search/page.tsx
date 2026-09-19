import Image from "next/image";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { AppShell, EmptyState, PageHeading } from "@/components/AppShell";
import { AddButton } from "@/components/AddButton";
import { db } from "@/lib/db";
import { listEntries, titles } from "@/lib/db/schema";
import { titleHref } from "@/lib/queries";
import { posterUrl, searchEverything, searchTitles } from "@/lib/tmdb";
import { getCurrentUser } from "@/lib/session";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const query = q?.trim() ?? "";
  const user = await getCurrentUser();

  const results = !query
    ? []
    : type === "tv" || type === "film"
      ? await searchTitles(query, type)
      : await searchEverything(query);

  /*
   * Which results are already listed. Resolved in ONE query on the
   * (tmdb_id, media_type) pairs rather than a lookup per row — and it has to
   * match on the pair, since a film and a series can share a tmdb id.
   */
  const onList = new Set<string>();
  if (results.length > 0) {
    const rows = await db
      .select({ tmdbId: titles.tmdbId, mediaType: titles.mediaType })
      .from(titles)
      .innerJoin(listEntries, eq(listEntries.titleId, titles.id))
      .where(inArray(titles.tmdbId, results.map((r) => r.tmdbId)));
    for (const r of rows) onList.add(`${r.mediaType}:${r.tmdbId}`);
  }

  return (
    <AppShell user={user}>
      <PageHeading
        title={query ? `“${query}”` : "Search"}
        count={query ? results.length : undefined}
      >
        {query && (
          <div className="flex items-center gap-1 rounded-full border border-line p-0.5">
            {[
              { v: undefined, label: "All" },
              { v: "tv", label: "TV" },
              { v: "film", label: "Films" },
            ].map((o) => {
              const active = (type ?? undefined) === o.v;
              const href = `/search?q=${encodeURIComponent(query)}${o.v ? `&type=${o.v}` : ""}`;
              return (
                <Link
                  key={o.label}
                  href={href}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    active ? "bg-accent text-canvas" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {o.label}
                </Link>
              );
            })}
          </div>
        )}
      </PageHeading>

      {!query ? (
        <EmptyState title="Search for something." hint="Use the box in the top right." />
      ) : results.length === 0 ? (
        <EmptyState title="Nothing found." hint="Try a different spelling." />
      ) : (
        <ul className="divide-y divide-line">
          {results.map((r) => {
            const poster = posterUrl(r.posterPath, "w342");
            const href = titleHref(r.mediaType, r.tmdbId);
            return (
              <li key={`${r.mediaType}:${r.tmdbId}`} className="flex items-center gap-4 py-3">
                <Link
                  href={href}
                  className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded border border-line bg-surface"
                >
                  {poster && (
                    <Image src={poster} alt="" fill sizes="56px" className="object-cover" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={href} className="hover:text-accent">
                    <p className="truncate font-medium">{r.name}</p>
                  </Link>
                  <p className="text-xs text-ink-faint">
                    {r.mediaType === "film" ? "Film" : "TV"} ·{" "}
                    {r.releaseDate?.slice(0, 4) ?? "—"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{r.overview}</p>
                </div>

                <div className="shrink-0">
                  <AddButton
                    tmdbId={r.tmdbId}
                    mediaType={r.mediaType}
                    alreadyOn={onList.has(`${r.mediaType}:${r.tmdbId}`)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
