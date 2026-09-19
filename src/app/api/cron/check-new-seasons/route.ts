import { and, asc, eq, gt, inArray, max } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cacheTitleSummary, cacheSeasonEpisodes, ensureTitleCached } from "@/lib/cache";
import { db } from "@/lib/db";
import { episodes, favouriteDirectors, listEntries, titles, users } from "@/lib/db/schema";
import { getPersonFilmCredits } from "@/lib/tmdb";

/*
 * Called daily by Vercel Cron. For every TV show marked as a favourite,
 * compare the highest season in TMDB against what we have cached. If TMDB
 * has more, cache the new episodes and move the show back to "want" so it
 * reappears on the watchlist.
 *
 * Vercel sends Authorization: Bearer <CRON_SECRET> on every cron invocation.
 * Without it this endpoint is open to anyone, which would let a stranger spam
 * TMDB lookups or flip list entries — so we always verify.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const favourites = await db
    .select({
      titleId: listEntries.titleId,
      tmdbId: titles.tmdbId,
      status: listEntries.status,
      name: titles.name,
    })
    .from(listEntries)
    .innerJoin(titles, eq(titles.id, listEntries.titleId))
    .where(and(eq(listEntries.favourite, true), eq(titles.mediaType, "tv")));

  const results: { name: string; newSeasons: number[]; relisted: boolean }[] = [];

  for (const fav of favourites) {
    const [maxRow] = await db
      .select({ maxSeason: max(episodes.seasonNumber) })
      .from(episodes)
      .where(and(eq(episodes.titleId, fav.titleId), gt(episodes.seasonNumber, 0)));

    const ourMax = maxRow?.maxSeason ?? 0;

    // Re-fetch TMDB detail to get the current season list.
    const { detail } = await ensureTitleCached(fav.tmdbId, "tv");

    const realSeasons = detail.seasons.filter(
      (s) => s.season_number > 0 && s.episode_count > 0,
    );
    const tmdbMax = realSeasons.length > 0 ? Math.max(...realSeasons.map((s) => s.season_number)) : 0;

    if (tmdbMax <= ourMax) continue;

    // Cache every new season's episodes.
    const newSeasons: number[] = [];
    for (let sn = ourMax + 1; sn <= tmdbMax; sn++) {
      await cacheSeasonEpisodes(fav.titleId, fav.tmdbId, sn);
      newSeasons.push(sn);
    }

    // Move back onto the watchlist at the END of the queue so it shows up
    // without jumping ahead of things they already decided to watch next.
    const relisted = fav.status === "watched" || fav.status === "dropped";
    if (relisted) {
      const [{ nextPos }] = await db
        .select({ nextPos: max(listEntries.position) })
        .from(listEntries);
      await db
        .update(listEntries)
        .set({ status: "want", position: (nextPos ?? 0) + 1 })
        .where(eq(listEntries.titleId, fav.titleId));
    }

    results.push({ name: fav.name, newSeasons, relisted });
  }

  /* ---- favourite directors: add new films to watchlist ------------------- */

  const directors = await db.select().from(favouriteDirectors);
  const directorFilms: { directorName: string; films: string[] }[] = [];

  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 180);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 180);

  for (const director of directors) {
    const credits = await getPersonFilmCredits(director.tmdbPersonId);
    const relevant = credits.filter((film) => {
      if (!film.release_date) return false;
      const d = new Date(film.release_date);
      return d >= windowStart && d <= windowEnd;
    });
    if (relevant.length === 0) continue;

    // Which of these are already on the list in any form?
    const tmdbIds = relevant.map((f) => f.id);
    const existing = await db
      .select({ tmdbId: titles.tmdbId })
      .from(listEntries)
      .innerJoin(titles, eq(titles.id, listEntries.titleId))
      .where(and(inArray(titles.tmdbId, tmdbIds), eq(titles.mediaType, "film")));
    const existingIds = new Set(existing.map((r) => r.tmdbId));

    const added: string[] = [];
    for (const film of relevant) {
      if (existingIds.has(film.id)) continue;

      // Cache the title row so we have an internal id to reference.
      const titleId = await cacheTitleSummary({
        tmdbId: film.id,
        mediaType: "film",
        name: film.title,
        overview: "",
        posterPath: film.poster_path,
        backdropPath: null,
        releaseDate: film.release_date,
      });

      const [{ userId }] = await db
        .select({ userId: users.id })
        .from(users)
        .orderBy(asc(users.createdAt))
        .limit(1);

      const [{ nextPos }] = await db.select({ nextPos: max(listEntries.position) }).from(listEntries);
      await db
        .insert(listEntries)
        .values({
          titleId,
          status: "want",
          addedByUserId: userId,
          position: (nextPos ?? 0) + 1,
          note: `New film by ${director.name}`,
        })
        .onConflictDoNothing({ target: listEntries.titleId });

      added.push(film.title);
    }
    if (added.length > 0) directorFilms.push({ directorName: director.name, films: added });
  }

  return NextResponse.json({
    checked: favourites.length,
    updatedShows: results,
    checkedDirectors: directors.length,
    addedDirectorFilms: directorFilms,
  });
}
