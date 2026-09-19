import Image from "next/image";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { EpisodeList } from "@/components/EpisodeList";
import { StarRating } from "@/components/StarRating";
import { StatusControl } from "@/components/StatusControl";
import { Walrus } from "@/components/Walrus";
import { cacheSeasonEpisodes, ensureShowCached } from "@/lib/cache";
import { db } from "@/lib/db";
import { episodes as episodesTable } from "@/lib/db/schema";
import { getListEntry, getShowRatings, getWatchKeys } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";
import { backdropUrl, posterUrl } from "@/lib/tmdb";

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();

  const [user, people] = await Promise.all([getCurrentUser(), getAllUsers()]);
  if (!user) notFound();

  const show = await ensureShowCached(tmdbId);

  /*
   * Make sure every season's episodes are in the local cache before
   * rendering the ticker. Seasons are fetched in parallel, and only the ones
   * we don't already hold — TMDB responses are also cached by Next's fetch
   * layer, so a revisit costs nothing.
   */
  const cached = await db
    .select({ season: episodesTable.seasonNumber })
    .from(episodesTable)
    .where(eq(episodesTable.showTmdbId, tmdbId));
  const haveSeasons = new Set(cached.map((r) => r.season));
  const missing = show.seasons
    .filter((s) => s.episode_count > 0 && !haveSeasons.has(s.season_number))
    .map((s) => s.season_number);
  if (missing.length > 0) {
    await Promise.all(missing.map((n) => cacheSeasonEpisodes(tmdbId, n)));
  }

  const [rows, watchKeys, ratingsByUser, entry] = await Promise.all([
    db
      .select()
      .from(episodesTable)
      .where(eq(episodesTable.showTmdbId, tmdbId))
      .orderBy(asc(episodesTable.seasonNumber), asc(episodesTable.episodeNumber)),
    getWatchKeys(tmdbId),
    getShowRatings(tmdbId),
    getListEntry(tmdbId),
  ]);

  // Progress for the walrus's line: how many episodes each of you has ticked.
  const other = people.find((p) => p.id !== user.id);
  const countFor = (userId: string) =>
    [...watchKeys].filter((k) => k.startsWith(`${userId}:`)).length;

  const backdrop = backdropUrl(show.backdrop_path);
  const poster = posterUrl(show.poster_path, "w500");
  const year = show.first_air_date?.slice(0, 4);

  return (
    <AppShell user={user}>
      {backdrop && (
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden opacity-25">
          <Image src={backdrop} alt="" fill sizes="100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-canvas" />
        </div>
      )}

      <Walrus
        context={{
          page: "show",
          name: show.name,
          yourProgress: countFor(user.id),
          theirProgress: other ? countFor(other.id) : 0,
          theirName: other?.displayName ?? "they",
        }}
      />

      <div className="flex flex-col gap-8 sm:flex-row">
        <div className="relative aspect-[2/3] w-40 shrink-0 self-start overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/40 sm:w-52">
          {poster && (
            <Image src={poster} alt="" fill sizes="208px" className="object-cover" priority />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{show.name}</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {[year, show.status, `${show.number_of_seasons} seasons`, `${show.number_of_episodes} episodes`]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {show.genres?.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {show.genres.map((g) => (
                <li
                  key={g.id}
                  className="rounded-full border border-line px-2.5 py-0.5 text-xs text-tag"
                >
                  {g.name}
                </li>
              ))}
            </ul>
          )}

          {show.overview && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
              {show.overview}
            </p>
          )}

          <div className="mt-6">
            <StatusControl tmdbId={tmdbId} status={entry?.status ?? null} />
          </div>

          <div className="mt-6 flex flex-wrap gap-6 border-t border-line pt-5">
            {people.map((p) => (
              <div key={p.id}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-faint">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: p.accentColor }}
                  />
                  {p.displayName}
                  {p.id === user.id && " (you)"}
                </p>
                <StarRating
                  tmdbId={tmdbId}
                  value={ratingsByUser[p.id] ?? null}
                  color={p.accentColor}
                  readOnly={p.id !== user.id}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="mb-4 border-b border-line pb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Episodes
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-faint">No episode data for this one yet.</p>
        ) : (
          <EpisodeList
            showTmdbId={tmdbId}
            episodes={rows.map((r) => ({
              tmdbId: r.tmdbId,
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
