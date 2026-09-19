import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { EpisodeList } from "@/components/EpisodeList";
import { TitleHero } from "@/components/TitleHero";
import { Walrus } from "@/components/Walrus";
import { cacheSeasonEpisodes, ensureTitleCached } from "@/lib/cache";
import { db } from "@/lib/db";
import { episodes as episodesTable } from "@/lib/db/schema";
import { getListEntry, getTitleRatings, getWatchKeys } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";

export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();

  const [user, people] = await Promise.all([getCurrentUser(), getAllUsers()]);
  if (!user) notFound();

  const { detail, titleId } = await ensureTitleCached(tmdbId, "tv");

  /*
   * Make sure every season's episodes are cached before rendering the ticker.
   * Fetched in parallel, and only the seasons we don't already hold — TMDB
   * responses are also cached by Next's fetch layer, so a revisit is free.
   */
  const cached = await db
    .select({ season: episodesTable.seasonNumber })
    .from(episodesTable)
    .where(eq(episodesTable.titleId, titleId));
  const have = new Set(cached.map((r) => r.season));
  const missing = detail.seasons
    .filter((s) => s.episode_count > 0 && !have.has(s.season_number))
    .map((s) => s.season_number);
  if (missing.length > 0) {
    await Promise.all(missing.map((n) => cacheSeasonEpisodes(titleId, tmdbId, n)));
  }

  const [rows, watchKeys, ratings, entry] = await Promise.all([
    db
      .select()
      .from(episodesTable)
      .where(eq(episodesTable.titleId, titleId))
      .orderBy(asc(episodesTable.seasonNumber), asc(episodesTable.episodeNumber)),
    getWatchKeys(titleId),
    getTitleRatings(titleId),
    getListEntry(titleId),
  ]);

  const other = people.find((p) => p.id !== user.id);
  const countFor = (userId: string) =>
    [...watchKeys].filter((k) => k.startsWith(`${userId}:`)).length;

  const meta = [
    detail.releaseDate?.slice(0, 4),
    detail.status,
    detail.numberOfSeasons ? `${detail.numberOfSeasons} seasons` : null,
    detail.numberOfEpisodes ? `${detail.numberOfEpisodes} episodes` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppShell user={user}>
      <Walrus
        context={{
          page: "show",
          name: detail.name,
          yourProgress: countFor(user.id),
          theirProgress: other ? countFor(other.id) : 0,
          theirName: other?.displayName ?? "they",
        }}
      />

      <TitleHero
        titleId={titleId}
        mediaType="tv"
        tmdbId={tmdbId}
        name={detail.name}
        overview={detail.overview}
        posterPath={detail.posterPath}
        backdropPath={detail.backdropPath}
        metaLine={meta}
        genres={detail.genres}
        status={entry?.status ?? null}
        people={people}
        currentUserId={user.id}
        ratings={ratings}
      />

      <section className="mt-12">
        <h2 className="mb-4 border-b border-line pb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Episodes
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-faint">No episode data for this one yet.</p>
        ) : (
          <EpisodeList
            titleId={titleId}
            tmdbId={tmdbId}
            episodes={rows.map((r) => ({
              id: r.id,
              seasonNumber: r.seasonNumber,
              episodeNumber: r.episodeNumber,
              name: r.name,
              airDate: r.airDate,
              runtime: r.runtime,
            }))}
            watchKeys={[...watchKeys]}
            people={people}
            currentUserId={user.id}
          />
        )}
      </section>
    </AppShell>
  );
}
