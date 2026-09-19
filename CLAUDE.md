# CLAUDE.md — tvbox

Reference notes for Claude (or any future contributor) working on this repo.
See `README.md` for setup and scripts; this file is about *why* things are the
way they are.

## What this project is

A private TV watchlist for exactly two people — Greg and Hannah. Letterboxd is
the deliberate reference for both look and interaction (poster-first grids,
half-star ratings, dark canvas, minimal chrome), but the scope is much smaller:
no social graph, no public profiles, no sign-up, no reviews feed.

The core loop is: search → add to a shared watchlist → tick episodes as you
watch → mark watched → rate it → get suggestions for what's next.

Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Drizzle + Postgres.

## Files

| File | Purpose |
|---|---|
| `src/lib/db/schema.ts` | Drizzle schema. Long comments explain the shared-vs-per-person split — read them before changing a table. |
| `src/lib/queries.ts` | Read side. `getShowCards()` is the one that matters: it fills every poster grid in 3 queries, not N+1. |
| `src/lib/actions.ts` | Every write, as server actions. All go through `requireUser()`. |
| `src/lib/tmdb.ts` | TMDB client. Server-only, Bearer auth, per-endpoint revalidate windows. |
| `src/lib/cache.ts` | Mirrors TMDB rows into `shows`/`episodes` so grids don't fan out to the API. |
| `src/lib/recommend.ts` | Claude-or-TMDB recommendation generation. The only thing that can cost money. |
| `src/lib/auth.ts` | Cookie signing (Web Crypto, so it runs on the edge in `proxy.ts`). |
| `src/lib/session.ts` | `getCurrentUser()` / `getAllUsers()`. |
| `src/lib/walrusLines.ts` | What the mascot says, and how a line is picked. |
| `src/proxy.ts` | Route gating. Was `middleware.ts` — Next 16 renamed the convention. |
| `src/components/WalrusArt.tsx` | The mascot's artwork, alone, so it can be swapped in one file. |
| `scripts/seed.mts` | Creates the two profiles. Idempotent. |
| `drizzle/` | Generated SQL migrations — committed on purpose. |

## Decisions worth knowing

- **The watchlist is shared; ticks and ratings are per-person.** `list_entries`
  is keyed by show alone (one list, not one each). `watches` and `ratings` carry
  a `user_id`, because the ask was explicitly "we can each rate a show" and
  because one of you inevitably gets ahead on an episode. `added_by_user_id` on
  a list entry is a nicety ("Hannah added this"), *not* access control — either
  person can change anything.

- **Ratings are stored in half-star units, 1..10.** `7` means 3.5 stars. Storing
  the integer avoids float-comparison trouble when averaging and makes the UI's
  granularity explicit. The ask was "out of 5" — halves cost nothing and mean
  switching the UI to half-stars later needs no migration.

- **Two PARTIAL unique indexes guard ratings, not one plain constraint.** A
  rating targets a show (`episode_tmdb_id IS NULL`) or an episode. A plain
  unique constraint can't enforce one-per-person-per-show, because in SQL NULL
  is never equal to NULL, so every show-level row looks distinct and duplicates
  freely. The `onConflictDoUpdate` in `rateShow()` passes a `targetWhere` that
  must mirror the index predicate **exactly** — Postgres only uses a partial
  unique index for ON CONFLICT when the predicate matches, otherwise you get
  "no unique or exclusion constraint matching the ON CONFLICT specification".

- **Show status is stored, not computed.** It would be tidier to derive
  "watched" from "every episode ticked", but TMDB episode counts shift as
  specials get added, so that silently stops being true for shows you've
  definitely finished. `list_entries.status` is set explicitly.

- **`shows`/`episodes` are a cache of TMDB keyed by TMDB's own ids.** No
  surrogate keys, so any row can be refreshed from upstream and foreign keys
  still line up. A show row must exist before a list entry, watch or rating can
  reference it — that's why `addToWatchlist()` calls `ensureShowCached()` first.

- **Live updates are polling, not websockets.** `LiveRefresh` calls
  `router.refresh()` every 10s and on focus, and pauses while the tab is hidden.
  With two users, a persistent channel is a lot of moving parts for a handful of
  writes an evening. `router.refresh()` re-runs server components without losing
  client state or scroll position, so a poll mid-scroll isn't disruptive.

- **Auth is one shared password plus a "who's watching" picker.** Deliberately
  not a real auth system — there are no roles and no per-person permissions. If
  this ever grows past the two of you, replace it wholesale rather than bolting
  roles on. Cookies are HMAC-signed with Web Crypto (not `node:crypto`) so the
  same code runs in `proxy.ts` on the edge runtime.

- **Nothing calls a paid API except one button.** `refreshRecommendations()` is
  the only path that can spend money, and it's behind an explicit press on the
  recommendations page — never on render, never on the refresh poll. It costs
  roughly 6p a press. With `ANTHROPIC_API_KEY` unset it falls back to TMDB's own
  "similar shows" and costs nothing; keep that fallback working.

- **`effort: "medium"` on the Claude call is a considered choice**, not an
  oversight — picking shows off a short ratings list isn't hard reasoning, and
  thinking tokens bill as output. Raise it if the suggestions feel lazy.

- **Claude returns titles, not TMDB ids**, so each suggestion is resolved by
  searching TMDB and preferring an exact first-air-year match. A title that
  doesn't resolve is **dropped**, not guessed at — a recommendation pointing at
  the wrong show is worse than one fewer.

- **The walrus's lines are local and deterministic.** Generating them would cost
  money on every render and the 10s poll would make him babble. `choose()` hashes
  the state into an index, so he only changes his mind when something on the page
  actually changes. Add lines freely; keep them keyed off real state.

- **The walrus credit in the footer is a licence condition.** The icon is CC BY
  from Noun Project. The `<text>` attribution baked into the downloaded SVG was
  cropped out of the viewBox and re-rendered as real text in `AppShell`'s footer
  — that satisfies the licence and is actually legible. Don't delete the footer
  line unless the artwork is replaced with something differently licensed.

## Conventions

- **Secrets never get a `NEXT_PUBLIC_` prefix.** That prefix inlines the value
  into the client bundle. `tmdb.ts`, `db/index.ts` and `recommend.ts` all start
  with `import "server-only"` so an accidental client import fails at build time
  rather than shipping a token.
- **Writes are server actions in `lib/actions.ts`**, and every one starts with
  `requireUser()`. Don't add a write path that skips it.
- **Reads that a page needs go in `lib/queries.ts`**, and should batch. If you
  find yourself querying inside a `.map()`, hoist it — `getShowCards()` is the
  pattern to copy.
- **Optimistic UI on anything you click** (`useOptimistic` + `useTransition`) —
  ticking an episode should feel instant. The poll re-syncs from the database
  regardless, so a failed write self-corrects within 10 seconds.
- **Colours come from the semantic tokens in `globals.css`** (`bg-surface`,
  `text-ink-muted`, `border-line`, `text-accent`), not the raw palette names and
  not hex literals. The six Japanese colours are defined once at the top of that
  file; a palette change should be a one-line edit there.
- **Dark-only, on purpose.** The palette is muted earth tones that read well on
  near-black and turn muddy on white. A light theme needs its own ramp, not an
  inversion — don't stub one in.
- After changing `schema.ts`, run `npm run db:generate` and commit the SQL.

## Known gaps

- **The show page, search, and Claude-backed recommendations have not been
  exercised against a live TMDB token** — they're typechecked and build clean,
  but the end-to-end verification done so far covered login, the profile picker,
  the watchlist, the archive and the rating/progress rendering against a real
  Postgres with seeded data. Check those three paths first if something's off.
- `npm audit` reports 4 moderate advisories, all transitive `esbuild` under
  `drizzle-kit` — a dev dependency, never in the runtime bundle. `npm audit fix
  --force` "fixes" it by downgrading drizzle-kit to 0.18.1, which is ancient and
  breaking. Left alone deliberately.
- No test suite yet. `npm run typecheck && npm run lint && npm run build` is the
  current gate.
- Episode-level ratings are in the schema but nothing in the UI writes them.
- There's no handling for a poster that 404s at the CDN (a null `posterPath`
  falls back to the title, but a broken URL shows the browser's broken-image icon).
