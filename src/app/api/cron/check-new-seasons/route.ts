import { and, eq, gt, max } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cacheSeasonEpisodes, ensureTitleCached } from "@/lib/cache";
import { db } from "@/lib/db";
import { episodes, listEntries, titles } from "@/lib/db/schema";

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

  return NextResponse.json({ checked: favourites.length, updated: results });
}
