"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { episodes, listEntries, ratings, recommendations, watches } from "./db/schema";
import { checkPassword, cookieNames, cookieOptions, makeGateCookie, makeWhoCookie } from "./auth";
import { cacheShowSummary, ensureShowCached } from "./cache";
import { getCurrentUser } from "./session";
import { getShow } from "./tmdb";

/** Every write path goes through this — no user, no writes. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/who");
  return user;
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

export async function addToWatchlist(tmdbId: number) {
  const user = await requireUser();
  // The show row must exist before a list entry can reference it.
  await ensureShowCached(tmdbId);

  await db
    .insert(listEntries)
    .values({ showTmdbId: tmdbId, status: "want", addedByUserId: user.id })
    // Already on the list: adding again shouldn't reset status or reassign
    // who added it, so this is a genuine no-op.
    .onConflictDoNothing({ target: listEntries.showTmdbId });

  revalidatePath("/");
  revalidatePath(`/show/${tmdbId}`);
}

export async function setShowStatus(
  tmdbId: number,
  status: "want" | "watching" | "watched" | "dropped",
) {
  await requireUser();
  await db
    .update(listEntries)
    .set({
      status,
      // Stamp the archive date on the way in, clear it on the way out, so
      // re-opening a finished show doesn't leave a stale "finished" date.
      finishedAt: status === "watched" ? new Date() : null,
    })
    .where(eq(listEntries.showTmdbId, tmdbId));

  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath(`/show/${tmdbId}`);
}

export async function removeFromList(tmdbId: number) {
  await requireUser();
  await db.delete(listEntries).where(eq(listEntries.showTmdbId, tmdbId));
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath(`/show/${tmdbId}`);
}

/* ---- episode ticking ----------------------------------------------------- */

export async function toggleEpisode(episodeTmdbId: number, showTmdbId: number) {
  const user = await requireUser();

  const existing = await db
    .select({ userId: watches.userId })
    .from(watches)
    .where(and(eq(watches.userId, user.id), eq(watches.episodeTmdbId, episodeTmdbId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(watches)
      .where(and(eq(watches.userId, user.id), eq(watches.episodeTmdbId, episodeTmdbId)));
  } else {
    await db
      .insert(watches)
      .values({ userId: user.id, episodeTmdbId, showTmdbId })
      .onConflictDoNothing();

    // First tick on a show still sitting in "want" means you've started it.
    const [entry] = await db
      .select({ status: listEntries.status })
      .from(listEntries)
      .where(eq(listEntries.showTmdbId, showTmdbId))
      .limit(1);
    if (entry?.status === "want") {
      await db
        .update(listEntries)
        .set({ status: "watching" })
        .where(eq(listEntries.showTmdbId, showTmdbId));
    }
  }

  revalidatePath(`/show/${showTmdbId}`);
  revalidatePath("/");
}

/** Tick (or untick) a whole season at once — the "we binged it" button. */
export async function toggleSeason(
  showTmdbId: number,
  seasonNumber: number,
  markWatched: boolean,
) {
  const user = await requireUser();

  const seasonEpisodes = await db
    .select({ tmdbId: episodes.tmdbId })
    .from(episodes)
    .where(
      and(eq(episodes.showTmdbId, showTmdbId), eq(episodes.seasonNumber, seasonNumber)),
    );
  if (seasonEpisodes.length === 0) return;
  const ids = seasonEpisodes.map((e) => e.tmdbId);

  if (markWatched) {
    await db
      .insert(watches)
      .values(ids.map((episodeTmdbId) => ({ userId: user.id, episodeTmdbId, showTmdbId })))
      .onConflictDoNothing();
  } else {
    await db
      .delete(watches)
      .where(and(eq(watches.userId, user.id), inArray(watches.episodeTmdbId, ids)));
  }

  revalidatePath(`/show/${showTmdbId}`);
  revalidatePath("/");
}

/* ---- ratings ------------------------------------------------------------- */

/** `stars` is in half-star units: 1..10 maps to 0.5..5 stars. */
export async function rateShow(tmdbId: number, stars: number) {
  const user = await requireUser();
  if (!Number.isInteger(stars) || stars < 1 || stars > 10) {
    throw new Error(`Rating out of range: ${stars} (expected 1..10 half-stars)`);
  }

  await db
    .insert(ratings)
    .values({ userId: user.id, showTmdbId: tmdbId, stars })
    // targetWhere must mirror `ratings_one_per_user_per_show` exactly —
    // Postgres only uses a partial unique index for ON CONFLICT when the
    // predicate matches, otherwise this raises "no unique or exclusion
    // constraint matching the ON CONFLICT specification".
    .onConflictDoUpdate({
      target: [ratings.userId, ratings.showTmdbId],
      targetWhere: isNull(ratings.episodeTmdbId),
      set: { stars, updatedAt: new Date() },
    });

  revalidatePath(`/show/${tmdbId}`);
  revalidatePath("/archive");
  revalidatePath("/");
}

export async function clearRating(tmdbId: number) {
  const user = await requireUser();
  await db
    .delete(ratings)
    .where(and(eq(ratings.userId, user.id), eq(ratings.showTmdbId, tmdbId)));
  revalidatePath(`/show/${tmdbId}`);
  revalidatePath("/archive");
}

/* ---- recommendations ----------------------------------------------------- */

export async function dismissRecommendation(id: string) {
  await requireUser();
  await db.update(recommendations).set({ dismissed: true }).where(eq(recommendations.id, id));
  revalidatePath("/recommendations");
}

export async function addRecommendationToList(id: string, tmdbId: number) {
  await addToWatchlist(tmdbId);
  await db.update(recommendations).set({ dismissed: true }).where(eq(recommendations.id, id));
  revalidatePath("/recommendations");
}

/* ---- search -------------------------------------------------------------- */

/** Cache a search result so it can be referenced before the detail fetch. */
export async function cacheSearchResult(tmdbId: number) {
  const show = await getShow(tmdbId);
  await cacheShowSummary(show);
}

/* ---- recommendation generation ------------------------------------------- */

export async function refreshRecommendations() {
  await requireUser();
  const { generateRecommendations } = await import("./recommend");
  const result = await generateRecommendations();
  revalidatePath("/recommendations");
  return result;
}
