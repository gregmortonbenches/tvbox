"use server";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import {
  episodes,
  listEntries,
  ratings,
  recommendations,
  watches,
  type ListStatus,
  type MediaType,
} from "./db/schema";
import { checkPassword, cookieNames, cookieOptions, makeGateCookie, makeWhoCookie } from "./auth";
import { ensureTitleCached } from "./cache";
import { getCurrentUser } from "./session";

/** Every write path goes through this — no user, no writes. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/who");
  return user;
}

/** Pages that show list state, revalidated together after any write. */
function revalidateLists(mediaType?: MediaType, tmdbId?: number) {
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/recommendations");
  if (mediaType && tmdbId) revalidatePath(`/${mediaType}/${tmdbId}`);
}

/* ---- auth ---------------------------------------------------------------- */

export async function submitPassword(_prev: unknown, formData: FormData) {
  const attempt = String(formData.get("password") ?? "");
  if (!(await checkPassword(attempt))) {
    return { error: "That's not it." };
  }
  const jar = await cookies();
  jar.set(cookieNames.gate, await makeGateCookie(), cookieOptions);
  const next = String(formData.get("next") ?? "/");
  // Only ever bounce to an in-app path — an absolute URL here would make
  // this an open redirect.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function chooseWho(userId: string, next: string = "/") {
  const jar = await cookies();
  jar.set(cookieNames.who, await makeWhoCookie(userId), cookieOptions);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function switchUser() {
  const jar = await cookies();
  jar.delete(cookieNames.who);
  redirect("/who");
}

/* ---- the list ------------------------------------------------------------ */

export async function addToWatchlist(tmdbId: number, mediaType: MediaType) {
  const user = await requireUser();
  // The title row must exist before a list entry can reference it, and this
  // is what turns a (tmdbId, mediaType) pair into our internal id.
  const { titleId } = await ensureTitleCached(tmdbId, mediaType);

  /*
   * Land at the END of the queue. Adding something shouldn't silently jump
   * ahead of things you already decided you wanted more — you promote it
   * deliberately if you want it next.
   */
  const [{ nextPosition }] = await db
    .select({ nextPosition: sql<number>`coalesce(max(${listEntries.position}), 0) + 1` })
    .from(listEntries);

  await db
    .insert(listEntries)
    .values({ titleId, status: "want", addedByUserId: user.id, position: nextPosition })
    // Already listed: adding again shouldn't reset status, reassign who
    // added it, or move its place in the queue — a genuine no-op.
    .onConflictDoNothing({ target: listEntries.titleId });

  revalidateLists(mediaType, tmdbId);
}

export async function setTitleStatus(
  titleId: string,
  status: ListStatus,
  mediaType?: MediaType,
  tmdbId?: number,
) {
  await requireUser();
  await db
    .update(listEntries)
    .set({
      status,
      // Stamp the archive date going in, clear it coming out, so re-opening
      // a finished title doesn't leave a stale "finished" date behind.
      finishedAt: status === "watched" ? new Date() : null,
    })
    .where(eq(listEntries.titleId, titleId));

  revalidateLists(mediaType, tmdbId);
}

export async function removeFromList(
  titleId: string,
  mediaType?: MediaType,
  tmdbId?: number,
) {
  await requireUser();
  await db.delete(listEntries).where(eq(listEntries.titleId, titleId));
  revalidateLists(mediaType, tmdbId);
}

/* ---- ticking ------------------------------------------------------------- */

/** TV: tick or untick one episode for the signed-in person. */
export async function toggleEpisode(episodeId: string, titleId: string, tmdbId: number) {
  const user = await requireUser();

  const existing = await db
    .select({ id: watches.id })
    .from(watches)
    .where(and(eq(watches.userId, user.id), eq(watches.episodeId, episodeId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(watches)
      .where(and(eq(watches.userId, user.id), eq(watches.episodeId, episodeId)));
  } else {
    await db
      .insert(watches)
      .values({ userId: user.id, titleId, episodeId })
      .onConflictDoNothing();

    // First tick on something still sitting in "want" means you've started it.
    const [entry] = await db
      .select({ status: listEntries.status })
      .from(listEntries)
      .where(eq(listEntries.titleId, titleId))
      .limit(1);
    if (entry?.status === "want") {
      await db
        .update(listEntries)
        .set({ status: "watching" })
        .where(eq(listEntries.titleId, titleId));
    }
  }

  revalidateLists("tv", tmdbId);
}

/**
 * Film: mark seen or unseen. A film has no episodes, so its watch row has a
 * null episodeId — guarded by the `watches_one_per_user_per_film` partial
 * unique index.
 *
 * Marking a film seen also moves it to "watched", because unlike a series
 * there's no in-between state to sit in.
 */
export async function toggleFilmWatched(titleId: string, tmdbId: number) {
  const user = await requireUser();

  const existing = await db
    .select({ id: watches.id })
    .from(watches)
    .where(
      and(
        eq(watches.userId, user.id),
        eq(watches.titleId, titleId),
        isNull(watches.episodeId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db.delete(watches).where(eq(watches.id, existing[0].id));
  } else {
    await db.insert(watches).values({ userId: user.id, titleId }).onConflictDoNothing();
    await db
      .update(listEntries)
      .set({ status: "watched", finishedAt: new Date() })
      .where(eq(listEntries.titleId, titleId));
  }

  revalidateLists("film", tmdbId);
}

/** TV: tick (or untick) a whole season at once — the "we binged it" button. */
export async function toggleSeason(
  titleId: string,
  tmdbId: number,
  seasonNumber: number,
  markWatched: boolean,
) {
  const user = await requireUser();

  const seasonEpisodes = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.titleId, titleId), eq(episodes.seasonNumber, seasonNumber)));
  if (seasonEpisodes.length === 0) return;
  const ids = seasonEpisodes.map((e) => e.id);

  if (markWatched) {
    await db
      .insert(watches)
      .values(ids.map((episodeId) => ({ userId: user.id, titleId, episodeId })))
      .onConflictDoNothing();
  } else {
    await db
      .delete(watches)
      .where(and(eq(watches.userId, user.id), inArray(watches.episodeId, ids)));
  }

  revalidateLists("tv", tmdbId);
}

/* ---- ratings ------------------------------------------------------------- */

/** `stars` is in half-star units: 1..10 maps to 0.5..5 stars. */
export async function rateTitle(
  titleId: string,
  stars: number,
  mediaType?: MediaType,
  tmdbId?: number,
) {
  const user = await requireUser();
  if (!Number.isInteger(stars) || stars < 1 || stars > 10) {
    throw new Error(`Rating out of range: ${stars} (expected 1..10 half-stars)`);
  }

  await db
    .insert(ratings)
    .values({ userId: user.id, titleId, stars })
    // targetWhere must mirror `ratings_one_per_user_per_title` exactly —
    // Postgres only uses a partial unique index for ON CONFLICT when the
    // predicate matches, otherwise it raises "no unique or exclusion
    // constraint matching the ON CONFLICT specification".
    .onConflictDoUpdate({
      target: [ratings.userId, ratings.titleId],
      targetWhere: isNull(ratings.episodeId),
      set: { stars, updatedAt: new Date() },
    });

  revalidateLists(mediaType, tmdbId);
}

export async function clearRating(
  titleId: string,
  mediaType?: MediaType,
  tmdbId?: number,
) {
  const user = await requireUser();
  await db
    .delete(ratings)
    .where(
      and(
        eq(ratings.userId, user.id),
        eq(ratings.titleId, titleId),
        isNull(ratings.episodeId),
      ),
    );
  revalidateLists(mediaType, tmdbId);
}


/* ---- priority ------------------------------------------------------------ */

/*
 * Every row starts at position 0 (the column's default when the migration
 * added it), so before any reorder can mean anything the group has to have
 * distinct values. This renumbers 0,1,2… by the order currently on screen,
 * and is a no-op once they're already distinct — so it self-heals on first
 * use rather than needing a data migration.
 */
async function ensureDistinctPositions(status: ListStatus) {
  const rows = await db
    .select({ titleId: listEntries.titleId, position: listEntries.position })
    .from(listEntries)
    .where(eq(listEntries.status, status))
    // Must match getTitleCards' ordering EXACTLY, including the tiebreak —
    // renumbering by a different order than the one on screen silently
    // reshuffles cards the user never touched.
    .orderBy(asc(listEntries.position), desc(listEntries.addedAt), asc(listEntries.titleId));

  const distinct = new Set(rows.map((r) => r.position));
  if (distinct.size === rows.length) return rows;

  await Promise.all(
    rows.map((r, i) =>
      db.update(listEntries).set({ position: i }).where(eq(listEntries.titleId, r.titleId)),
    ),
  );
  return rows.map((r, i) => ({ ...r, position: i }));
}

/**
 * Swap two entries' places.
 *
 * The CALLER passes the neighbour, rather than the server working out what's
 * "above" — the client knows what's actually on screen, and under a TV/film
 * filter the row above may not be the row above in the database. Doing it
 * this way keeps the buttons honest under any filter.
 */
export async function swapPriority(titleIdA: string, titleIdB: string) {
  await requireUser();

  const rows = await db
    .select({
      titleId: listEntries.titleId,
      position: listEntries.position,
      status: listEntries.status,
    })
    .from(listEntries)
    .where(inArray(listEntries.titleId, [titleIdA, titleIdB]));

  if (rows.length !== 2) return;
  // Reordering across sections would be meaningless — "above" only has a
  // meaning within one list.
  if (rows[0].status !== rows[1].status) return;

  const fixed = await ensureDistinctPositions(rows[0].status);
  const a = fixed.find((r) => r.titleId === titleIdA);
  const b = fixed.find((r) => r.titleId === titleIdB);
  if (!a || !b) return;

  await Promise.all([
    db.update(listEntries).set({ position: b.position }).where(eq(listEntries.titleId, a.titleId)),
    db.update(listEntries).set({ position: a.position }).where(eq(listEntries.titleId, b.titleId)),
  ]);

  revalidateLists();
}

/** Straight to the front of the queue — one update, no renumbering needed. */
export async function moveToTop(titleId: string) {
  await requireUser();

  const [entry] = await db
    .select({ status: listEntries.status })
    .from(listEntries)
    .where(eq(listEntries.titleId, titleId))
    .limit(1);
  if (!entry) return;

  const fixed = await ensureDistinctPositions(entry.status);
  const min = Math.min(...fixed.map((r) => r.position));

  // Positions may go negative. Only the relative order matters, so there is
  // no need to renumber the rest.
  await db
    .update(listEntries)
    .set({ position: min - 1 })
    .where(eq(listEntries.titleId, titleId));

  revalidateLists();
}

/* ---- whose list is it ---------------------------------------------------- */

/** `userId` null means both of you want it — the default and common case. */
export async function setWantedBy(
  titleId: string,
  userId: string | null,
  mediaType?: MediaType,
  tmdbId?: number,
) {
  await requireUser();
  await db
    .update(listEntries)
    .set({ wantedByUserId: userId })
    .where(eq(listEntries.titleId, titleId));
  revalidateLists(mediaType, tmdbId);
}

/* ---- the note ------------------------------------------------------------ */

/** Why it's on the list — "Dave keeps going on about it". Empty clears it. */
export async function setNote(
  titleId: string,
  note: string,
  mediaType?: MediaType,
  tmdbId?: number,
) {
  await requireUser();
  const trimmed = note.trim();
  await db
    .update(listEntries)
    .set({ note: trimmed.length > 0 ? trimmed.slice(0, 500) : null })
    .where(eq(listEntries.titleId, titleId));
  revalidateLists(mediaType, tmdbId);
}

/* ---- recommendations ----------------------------------------------------- */

export async function dismissRecommendation(id: string) {
  await requireUser();
  await db.update(recommendations).set({ dismissed: true }).where(eq(recommendations.id, id));
  revalidatePath("/recommendations");
}

export async function refreshRecommendations() {
  await requireUser();
  const { generateRecommendations } = await import("./recommend");
  const result = await generateRecommendations();
  revalidatePath("/recommendations");
  return result;
}
