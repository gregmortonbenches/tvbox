import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdb";
import type { CurrentUser } from "@/lib/session";
import type { ShowCard } from "@/lib/queries";
import { StarRating } from "./StarRating";

/*
 * The poster IS the interface — Letterboxd's central idea. Title text is
 * secondary and sits under the image rather than over it, so a grid reads as
 * artwork first.
 */
export function PosterCard({
  show,
  people,
  showProgress = true,
}: {
  show: ShowCard;
  people: CurrentUser[];
  showProgress?: boolean;
}) {
  const poster = posterUrl(show.posterPath);
  const year = show.firstAirDate?.slice(0, 4);

  return (
    <div className="group">
      <Link
        href={`/show/${show.tmdbId}`}
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
              {show.name}
            </div>
          )}
        </div>
      </Link>

      <div className="mt-2 space-y-1.5">
        <Link href={`/show/${show.tmdbId}`} className="block">
          <p className="truncate text-sm font-medium leading-tight text-ink" title={show.name}>
            {show.name}
          </p>
          {year && <p className="text-xs text-ink-faint">{year}</p>}
        </Link>

        {showProgress && show.totalEpisodes > 0 && (
          <div className="space-y-1 pt-0.5">
            {people.map((p) => {
              const watched = show.watchedByUser[p.id] ?? 0;
              const pct = Math.min(100, Math.round((watched / show.totalEpisodes) * 100));
              return (
                <div key={p.id} className="flex items-center gap-1.5" title={`${p.displayName}: ${watched}/${show.totalEpisodes}`}>
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
                    {watched}/{show.totalEpisodes}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          {people.map((p) => {
            const stars = show.ratingByUser[p.id];
            if (!stars) return null;
            return (
              <div key={p.id} className="flex items-center gap-1" title={`${p.displayName}: ${stars / 2}/5`}>
                {/* Initial as well as colour — two star rows side by side are
                    otherwise only tellable apart if you know the colours. */}
                <span className="text-[10px] font-medium" style={{ color: p.accentColor }}>
                  {p.displayName.charAt(0)}
                </span>
                <StarRating
                  tmdbId={show.tmdbId}
                  value={stars}
                  color={p.accentColor}
                  size="sm"
                  readOnly
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
