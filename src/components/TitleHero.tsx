import Image from "next/image";
import { Scores } from "./Scores";
import { StarRating } from "./StarRating";
import { StatusControl } from "./StatusControl";
import type { CurrentUser } from "@/lib/session";
import type { ListStatus, MediaType } from "@/lib/db/schema";
import { backdropUrl, posterUrl } from "@/lib/tmdb";

/*
 * The header both /tv/[id] and /film/[id] share: backdrop, poster, metadata,
 * status control and the two rating rows. Only the metadata LINE differs
 * between them, so that's passed in rather than branched on here.
 */
export function TitleHero({
  titleId,
  mediaType,
  tmdbId,
  name,
  overview,
  posterPath,
  backdropPath,
  metaLine,
  genres,
  rtCritic,
  imdbRating,
  metascore,
  status,
  people,
  currentUserId,
  ratings,
  children,
}: {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  metaLine: string;
  genres: { id: number; name: string }[];
  rtCritic: number | null;
  imdbRating: number | null;
  metascore: number | null;
  status: ListStatus | null;
  people: CurrentUser[];
  currentUserId: string;
  ratings: Record<string, number>;
  children?: React.ReactNode;
}) {
  const backdrop = backdropUrl(backdropPath);
  const poster = posterUrl(posterPath, "w500");

  return (
    <>
      {backdrop && (
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden opacity-25">
          <Image src={backdrop} alt="" fill sizes="100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-canvas" />
        </div>
      )}

      <div className="flex flex-col gap-8 sm:flex-row">
        <div className="relative aspect-[2/3] w-40 shrink-0 self-start overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/40 sm:w-52">
          {poster && (
            <Image src={poster} alt="" fill sizes="208px" className="object-cover" priority />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
          <p className="mt-1 text-sm text-ink-faint">{metaLine}</p>

          <div className="mt-2">
            <Scores
              rtCritic={rtCritic}
              imdbRating={imdbRating}
              metascore={metascore}
              size="md"
            />
          </div>

          {genres.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <li
                  key={g.id}
                  className="rounded-full border border-line px-2.5 py-0.5 text-xs text-tag"
                >
                  {g.name}
                </li>
              ))}
            </ul>
          )}

          {overview && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">{overview}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <StatusControl
              titleId={titleId}
              mediaType={mediaType}
              tmdbId={tmdbId}
              status={status}
            />
            {children}
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
                  {p.id === currentUserId && " (you)"}
                </p>
                <StarRating
                  titleId={titleId}
                  mediaType={mediaType}
                  tmdbId={tmdbId}
                  value={ratings[p.id] ?? null}
                  color={p.accentColor}
                  readOnly={p.id !== currentUserId}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
