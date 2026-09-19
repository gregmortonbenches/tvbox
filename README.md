# tvbox

A private watchlist for two, covering both TV and films. Search, queue things
up, tick off episodes as you watch, archive what you've finished, rate things
out of five, and get suggestions for what to watch next.

Built for Greg and Hannah specifically — there's no sign-up, no social feed,
and no public profiles. Two people, one shared list.

## What it does

- **Watchlist** — a single shared list of what you want to watch, split into
  things you've started ("Carrying on") and things you haven't. Filter by
  All / TV / Films.
- **Episode ticking** — open a series, tick episodes as you watch them. Both
  people's progress shows on every row, so you can see who's ahead. Films get a
  single "seen it" toggle instead, since there's nothing to be partway through.
- **Archive** — everything you've finished, plus a quieter section for things
  you gave up on.
- **Ratings** — half-stars out of five, one rating each, shown side by side.
- **For you** — suggestions with a reason attached, either from Claude or from
  TMDB's own "similar shows".
- **Ratings from elsewhere** — Rotten Tomatoes, IMDb and Metacritic scores
  shown alongside your own stars.
- **A walrus** — who has opinions about your viewing habits.

Two open tabs stay in step: pages re-fetch every 10 seconds and immediately
whenever a tab regains focus, so an episode ticked on the sofa shows up on the
other phone within seconds.

## Setup

You need Node 20+, a Postgres database, and a TMDB account.

```bash
npm install
cp .env.example .env.local     # then fill it in — see below
npm run db:migrate             # create the tables
npm run db:seed                # create the two profiles
npm run dev
```

Then open http://localhost:3000, enter the shared password, and pick who you are.

### Environment variables

| Variable | Required | What it's for |
|---|---|---|
| `TMDB_ACCESS_TOKEN` | yes | TMDB **v4 read access token** (the long `eyJ...` one, not the short v3 key). From [TMDB API settings](https://www.themoviedb.org/settings/api). |
| `DATABASE_URL` | yes | Postgres connection string. Hosted providers usually need `?sslmode=require`. |
| `APP_PASSWORD` | yes | The shared password. Anyone with it can read and write everything. |
| `AUTH_SECRET` | yes | Signs the login cookies. Generate with `openssl rand -base64 32`. |
| `OMDB_API_KEY` | no | Enables Rotten Tomatoes / IMDb / Metacritic scores. Free key, 1,000 lookups/day, from [omdbapi.com](https://www.omdbapi.com/apikey.aspx). |
| `ANTHROPIC_API_KEY` | no | Enables Claude-written recommendations. Leave blank for the free TMDB fallback. |
| `SEED_NAME_1` / `SEED_NAME_2` | no | Display names for the two profiles. Default to Greg and Hannah. |

Never prefix `TMDB_ACCESS_TOKEN` (or any other secret here) with `NEXT_PUBLIC_`
— that inlines the value into the browser bundle.

### What it costs

TMDB is free for this kind of personal use, and nothing in the app calls a paid
API on its own. The one exception is the **Find something** button on the
recommendations page, which costs roughly **6p per press** if you've set
`ANTHROPIC_API_KEY` (about 1k input / 3k output tokens on Claude Opus 5 at
medium effort). Leave the key blank and recommendations fall back to TMDB,
which is free.

Nothing calls the Claude API on page load, on the refresh poll, or when you
tick an episode.

## Importing existing history

Two importers, in `scripts/`. Both take `--dry-run` (parses and reports, writes
nothing) and `--user <username>` (defaults to `greg`).

```bash
npm run import:trakt -- --dry-run     # preview
npm run import:trakt                  # 59 shows, ~3,400 episodes
npm run import:films -- --dry-run     # preview + write the review file
npm run import:films                  # only confident matches
```

**Trakt (TV)** reads `data/trakt-shows.json`. The export carries TMDB ids, so
nothing is resolved by search and nothing can mis-match. Shows where
`plays >= aired_episodes` are marked watched with every episode ticked; partly
watched shows get the status only, because the export doesn't say *which*
episodes were seen and inventing that would be a lie.

**Films** reads `data/letterboxd-films.txt`, which was transcribed from
screenshots and has no TMDB ids. Every title has to be resolved by search, so
the importer only writes **confident** matches — exactly one candidate whose
name matches exactly after normalising case, accents and punctuation — and
writes everything else to `data/films-needs-review.json` for you to correct.
Add a disambiguating year to the source (`Crash (1996)`) and re-run.

It also flags TV series sitting in the film list (*Chernobyl*, *Band of
Brothers*, *Small Axe* and friends) rather than dropping them silently.

Neither importer records watch dates: the Trakt timestamps are all epoch, and
Letterboxd grid order is by release date, not viewing date. A fabricated date
would misorder the archive.

## Rotten Tomatoes scores

RT has **no self-serve API** — access runs through the Fandango Developer
Network as an approved-partner licence, reportedly starting around $60k/year.
So the Tomatometer arrives second-hand via [OMDb](https://www.omdbapi.com/),
which republishes it alongside IMDb and Metacritic.

Two consequences worth knowing:

- **Critic score only.** OMDb does not carry RT's audience score. If that
  number matters more to you, MDBList returns both (plus a Letterboxd rating)
  and would be a drop-in replacement for `src/lib/omdb.ts`.
- **TV coverage is thinner than film.** Expect gaps on series. A missing score
  is normal, not an error.

```bash
npm run backfill:ratings -- --dry-run   # what would be looked up, and how long
npm run backfill:ratings                # go
npm run backfill:ratings -- --limit 200 # a smaller bite
npm run backfill:ratings -- --refresh-after 90   # re-check anything older than 90 days
```

The free tier is 1,000 lookups/day, so a full backfill of ~1,360 titles takes
two days. That's handled rather than fatal: the script stops cleanly when the
quota runs out, says how many are left, and resumes where it stopped next time
you run it. A title that was looked up but had no scores is still marked as
checked, so the quota isn't spent re-asking about the same misses forever.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration after changing `schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema straight to the DB (dev only — skips migration files) |
| `npm run db:studio` | Drizzle Studio, a GUI for the data |
| `npm run db:seed` | Create/update the two profiles. Safe to re-run. |
| `npm test` | Parser and film-matcher tests |
| `npm run import:trakt` | Import TV history (see above) |
| `npm run import:films` | Import film history (see above) |
| `npm run backfill:ratings` | Fetch RT/IMDb/Metacritic scores (see above) |

## Deploying

Any host that runs Next.js will do. Vercel plus a hosted Postgres (Neon,
Supabase, Vercel Postgres) is the least work, and both have free tiers that fit
two people comfortably.

Set every required variable from the table above in the host's environment,
then run `npm run db:migrate && npm run db:seed` against the production database
once. `AUTH_SECRET` must be a real random value in production — cookies signed
with a guessable secret can be forged.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM ·
Postgres · TMDB · the Anthropic SDK (optional).

## Credits

Title data and images from [TMDB](https://www.themoviedb.org/). This product
uses the TMDB API but is not endorsed or certified by TMDB.

Ratings via [OMDb](https://www.omdbapi.com/), which republishes Rotten
Tomatoes, IMDb and Metacritic scores. Not affiliated with or endorsed by any of
them. Scores are displayed as plain numbers rather than Rotten Tomatoes'
tomato imagery, which is their trademark.

Walrus icon by Lewen Design from [Noun Project](https://thenounproject.com/),
used under CC BY. The credit in the app footer is a licence condition — if you
swap the artwork, update or remove it accordingly.
