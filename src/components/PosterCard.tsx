import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdb";
import type { CurrentUser } from "@/lib/session";
import { titleHref, type TitleCard } from "@/lib/queries";
import { PriorityControls } from "./PriorityControls";
import { Scores } from "./Scores";
import { StarRating } from "./StarRating";

/*
 * The poster IS the interface — Letterboxd's central idea. Title text is
 * secondary and sits under the image rather than over it, so a grid reads as
 * artwork first.
 *
 * TV tiles carry a per-person progress bar; film tiles carry a per-person
 * seen dot instead, because a film has no episodes to be partway through.
 */
export function PosterCard({
  title,
  people,
  showProgress = true,
  rank,
  prevId = null,
  nextId = null,
}: {
  title: TitleCard;
  people: CurrentUser[];
  showProgress?: boolean;
  /** 1-based place in the queue. Omit to hide the badge and the arrows. */
  rank?: number;
  prevId?: string | null;
  nextId?: string | null;
}) {
  const poster = posterUrl(title.posterPath);
  const year = title.releaseDate?.slice(0, 4);
  const href = titleHref(title.mediaType, title.tmdbId);
  const isFilm = title.mediaType === "film";
  /** Null wantedByUserId means both of you, so there's nothing to flag. */
  const soloWanter = title.wantedByUserId
    ? people.find((p) => p.id === title.wantedByUserId)
    : null;

  return (
    <div className="group">
      <Link
        href={href}
        className="block overflow-hidden rounded-md border border-line bg-surface transition-all duration-200 group-hover:border-accent/60 group-hover:shadow-lg group-hover:shadow-black/40"
      >
        <div className="relative aspect-[2/3]">
          {poster ? (
            <Image
              src={poster}
              alt=""
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 180px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-3 text-center text-xs text-ink-faint">
              {title.name}
            </div>
          )}
          {isFilm && (
            <span className="absolute left-1.5 top-1.5 rounded bg-canvas/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-muted backdrop-blur-sm">
              Film
            </span>
          )}
          {rank !== undefined && (
            <span
              className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded bg-canvas/85 font-mono text-[11px] tabular-nums text-accent backdrop-blur-sm"
              title={`Number ${rank} in the queue`}
            >
              {rank}
            </span>
          )}
        </div>
      </Link>

      <div className="mt-2 space-y-1.5">
        <Link href={href} className="block">
          <p className="truncate text-sm font-medium leading-tight text-ink" title={title.name}>
            {title.name}
          </p>
          {year && <p className="text-xs text-ink-faint">{year}</p>}
        </Link>

        {soloWanter && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
            style={{ borderColor: soloWanter.accentColor, color: soloWanter.accentColor }}
            title={`Only ${soloWanter.displayName} wants to watch this`}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: soloWanter.accentColor }} />
            {soloWanter.displayName} only
          </span>
        )}

        {title.note && (
          <p className="line-clamp-2 text-xs italic leading-snug text-ink-muted" title={title.note}>
            {title.note}
          </p>
        )}

        <Scores
          rtCritic={title.rtCritic}
          imdbRating={title.imdbRating}
          metascore={title.metascore}
        />

        {showProgress && !isFilm && title.totalEpisodes > 0 && (
          <div className="space-y-1 pt-0.5">
            {people.map((p) => {
              const watched = title.watchedByUser[p.id] ?? 0;
              const pct = Math.min(100, Math.round((watched / title.totalEpisodes) * 100));
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5"
                  title={`${p.displayName}: ${watched}/${title.totalEpisodes}`}
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: p.accentColor, opacity: watched > 0 ? 1 : 0.3 }}
                  />
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%`, background: p.accentColor }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right font-mono text-[10px] text-ink-faint">
                    {watched}/{title.totalEpisodes}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {showProgress && isFilm && (
          <div className="flex items-center gap-2 pt-0.5">
            {people.map((p) => {
              const seen = (title.watchedByUser[p.id] ?? 0) > 0;
              return (
                <span
                  key={p.id}
                  title={`${p.displayName}: ${seen ? "seen" : "not seen"}`}
                  className="flex items-center gap-1 text-[10px]"
                  style={{ color: p.accentColor, opacity: seen ? 1 : 0.35 }}
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: p.accentColor }}
                  />
                  {p.displayName.charAt(0)}
                </span>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          {people.map((p) => {
            const stars = title.ratingByUser[p.id];
            if (!stars) return null;
            return (
              <div
                key={p.id}
                className="flex items-center gap-1"
                title={`${p.displayName}: ${stars / 2}/5`}
              >
                {/* Initial as well as colour — two star rows side by side are
                    otherwise only tellable apart if you know the colours. */}
                <span className="text-[10px] font-medium" style={{ color: p.accentColor }}>
                  {p.displayName.charAt(0)}
                </span>
                <StarRating
                  titleId={title.id}
                  mediaType={title.mediaType}
                  tmdbId={title.tmdbId}
                  value={stars}
                  color={p.accentColor}
                  size="sm"
                  readOnly
                />
              </div>
            );
          })}
        </div>

        {rank !== undefined && (
          <div className="pt-0.5">
            <PriorityControls titleId={title.id} prevId={prevId} nextId={nextId} />
          </div>
        )}
      </div>
    </div>
  );
}
