/*
 * Import a Trakt watched-shows export (data/trakt-shows.json).
 *
 *   npm run import:trakt -- --dry-run
 *   npm run import:trakt -- --user greg
 *   npm run import:trakt -- --no-episodes    (list entries only, much faster)
 *
 * Much simpler than the film import because the export CARRIES TMDB IDS —
 * nothing has to be resolved by search, so nothing can be mis-matched.
 *
 * `plays` vs `aired_episodes` decides the status:
 *   plays >= aired_episodes  -> watched, and every episode is ticked
 *   0 < plays < aired         -> watching, and NO episodes are ticked, because
 *                                the export doesn't say WHICH ones were seen
 *                                and inventing that would be a lie
 *
 * Watch dates are not imported: every last_watched_at in the export is the
 * epoch (the timestamps were stripped), so there is nothing real to record.
 */
import "dotenv/config";
import fs from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { episodes, listEntries, titles, users, watches } from "../src/lib/db/schema.ts";

const SOURCE = "data/trakt-shows.json";
const TMDB = "https://api.themoviedb.org/3";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const NO_EPISODES = args.includes("--no-episodes");
const USERNAME = (() => {
  const i = args.indexOf("--user");
  return i >= 0 ? args[i + 1] : "greg";
})();

type TraktShow = {
  plays: number;
  show: { title: string; year: number; aired_episodes: number; ids: { tmdb: number } };
};

async function tmdb<T>(p: string): Promise<T> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) throw new Error("TMDB_ACCESS_TOKEN is not set.");
  const res = await fetch(`${TMDB}${p}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${p}`);
  return res.json() as Promise<T>;
}

type Detail = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  status: string;
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: { season_number: number; episode_count: number }[];
};

type SeasonPayload = {
  episodes: {
    id: number;
    season_number: number;
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    air_date: string | null;
    runtime: number | null;
  }[];
};

async function main() {
  const entries: TraktShow[] = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  console.log(`Parsed ${entries.length} shows from ${SOURCE}`);

  const complete = entries.filter((e) => e.plays >= e.show.aired_episodes);
  const partial = entries.filter((e) => e.plays > 0 && e.plays < e.show.aired_episodes);
  console.log(`  fully watched  ${complete.length}`);
  console.log(`  part watched   ${partial.length}  (status only — the export doesn't say which episodes)`);
  console.log(`  episodes       ${entries.reduce((a, e) => a + e.show.aired_episodes, 0)}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written, no TMDB calls made.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const client = postgres(url, { max: 4 });
  const db = drizzle(client);

  const [user] = await db.select().from(users).where(eq(users.username, USERNAME)).limit(1);
  if (!user) throw new Error(`No such user: ${USERNAME}. Run npm run db:seed first.`);
  console.log(`\nImporting as ${user.displayName}…`);

  let shows = 0;
  let ticked = 0;

  for (const entry of entries) {
    const { ids, aired_episodes } = entry.show;
    let detail: Detail;
    try {
      detail = await tmdb<Detail>(`/tv/${ids.tmdb}`);
    } catch (err) {
      console.error(`  ! ${entry.show.title}: ${(err as Error).message}`);
      continue;
    }

    const [title] = await db
      .insert(titles)
      .values({
        tmdbId: detail.id,
        mediaType: "tv",
        name: detail.name,
        overview: detail.overview,
        posterPath: detail.poster_path,
        backdropPath: detail.backdrop_path,
        releaseDate: detail.first_air_date,
        lastAirDate: detail.last_air_date,
        status: detail.status,
        numberOfSeasons: detail.number_of_seasons,
        numberOfEpisodes: detail.number_of_episodes,
      })
      .onConflictDoUpdate({
        target: [titles.tmdbId, titles.mediaType],
        set: { name: detail.name, cachedAt: new Date() },
      })
      .returning({ id: titles.id });

    const fullyWatched = entry.plays >= aired_episodes;

    await db
      .insert(listEntries)
      .values({
        titleId: title.id,
        status: fullyWatched ? "watched" : "watching",
        addedByUserId: user.id,
        // No finishedAt: the export's timestamps are all epoch, so there is
        // no real date to record and a fake one would misorder the archive.
      })
      .onConflictDoNothing({ target: listEntries.titleId });

    if (!NO_EPISODES && fullyWatched) {
      for (const season of detail.seasons) {
        if (season.episode_count === 0) continue;
        let payload: SeasonPayload;
        try {
          payload = await tmdb<SeasonPayload>(`/tv/${detail.id}/season/${season.season_number}`);
        } catch {
          continue;
        }
        if (!payload.episodes?.length) continue;

        const rows = await db
          .insert(episodes)
          .values(
            payload.episodes.map((e) => ({
              tmdbId: e.id,
              titleId: title.id,
              seasonNumber: e.season_number,
              episodeNumber: e.episode_number,
              name: e.name,
              overview: e.overview,
              stillPath: e.still_path,
              airDate: e.air_date || null,
              runtime: e.runtime,
            })),
          )
          .onConflictDoUpdate({ target: episodes.tmdbId, set: { name: episodes.name } })
          .returning({ id: episodes.id });

        await db
          .insert(watches)
          .values(rows.map((r) => ({ userId: user.id, titleId: title.id, episodeId: r.id })))
          .onConflictDoNothing();
        ticked += rows.length;
      }
    }

    shows++;
    process.stdout.write(`\r  ${shows}/${entries.length} shows, ${ticked} episodes ticked…`);
  }

  console.log(`\nDone. ${shows} shows, ${ticked} episodes ticked, all as ${user.displayName}.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
