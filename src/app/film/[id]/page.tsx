import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DirectorFavouriteToggle } from "@/components/DirectorFavouriteToggle";
import { FilmWatchToggle } from "@/components/FilmWatchToggle";
import { ListEntryPanel } from "@/components/ListEntryPanel";
import { TitleHero } from "@/components/TitleHero";
import { ensureTitleCached } from "@/lib/cache";
import { getFilmWatchers, getFavouriteDirectorIds, getListEntry, getTitleRatings } from "@/lib/queries";
import { getAllUsers, getCurrentUser } from "@/lib/session";

export default async function FilmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();

  const [user, people] = await Promise.all([getCurrentUser(), getAllUsers()]);
  if (!user) notFound();

  const { detail, titleId, stored } = await ensureTitleCached(tmdbId, "film");

  const [watchers, ratings, entry, favouriteDirectorIds] = await Promise.all([
    getFilmWatchers(titleId),
    getTitleRatings(titleId),
    getListEntry(titleId),
    getFavouriteDirectorIds(),
  ]);

  const other = people.find((p) => p.id !== user.id);

  const meta = [
    detail.releaseDate?.slice(0, 4),
    detail.runtime ? `${detail.runtime} min` : null,
    detail.status,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppShell user={user}>
      <TitleHero
        titleId={titleId}
        mediaType="film"
        tmdbId={tmdbId}
        name={detail.name}
        overview={detail.overview}
        posterPath={detail.posterPath}
        backdropPath={detail.backdropPath}
        metaLine={meta}
        genres={detail.genres}
        rtCritic={stored.rtCritic}
        imdbRating={stored.imdbRating}
        metascore={stored.metascore}
        status={entry?.status ?? null}
        people={people}
        currentUserId={user.id}
        ratings={ratings}
      >
        {/* A film's watch state is binary, so it gets a single toggle here
            instead of the episode ticker a series has. */}
        <FilmWatchToggle
          titleId={titleId}
          tmdbId={tmdbId}
          seen={watchers.has(user.id)}
        />
      </TitleHero>

      <ListEntryPanel entry={entry} mediaType="film" tmdbId={tmdbId} people={people} />

      {detail.directors.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {detail.directors.length === 1 ? "Director" : "Directors"}
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.directors.map((d) => (
              <DirectorFavouriteToggle
                key={d.id}
                tmdbPersonId={d.id}
                name={d.name}
                isFavourite={favouriteDirectorIds.has(d.id)}
              />
            ))}
          </div>
        </div>
      )}

      {other && (
        <p className="mt-8 text-sm text-ink-faint">
          {watchers.has(other.id)
            ? `${other.displayName} has seen this.`
            : `${other.displayName} hasn't seen this yet.`}
        </p>
      )}
    </AppShell>
  );
}
