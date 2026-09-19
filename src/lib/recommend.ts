import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "./db";
import { listEntries, recommendations, shows } from "./db/schema";
import { getTasteProfile } from "./queries";
import { cacheShowSummary } from "./cache";
import { searchShows, type TmdbShowSummary } from "./tmdb";

/*
 * "A section where you recommend things to us."
 *
 * Two strategies, picked at runtime:
 *
 *   1. ANTHROPIC_API_KEY set -> ask Claude, given what you've both rated and
 *      what's already on the list. Better suggestions, because it can reason
 *      about *why* you liked something rather than matching metadata.
 *   2. No key -> TMDB's own "recommendations" endpoint seeded from your
 *      highest-rated shows. Needs no extra account and is a reasonable
 *      fallback, just blunter.
 *
 * Either way the output is rows in `recommendations` with a human-readable
 * `reason`, so the page can say why something was suggested instead of
 * presenting an unexplained list.
 */

const SuggestionList = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().describe("The show's title, as commonly known in English"),
        year: z.number().describe("Year it first aired, to disambiguate remakes"),
        reason: z
          .string()
          .describe("One or two sentences, addressed to the pair, on why they'd like it"),
      }),
    )
    .describe("Between 5 and 8 suggestions"),
});

export type GenerateResult = {
  added: number;
  source: "claude" | "tmdb_similar";
  note?: string;
};

export async function generateRecommendations(): Promise<GenerateResult> {
  const [taste, existing] = await Promise.all([
    getTasteProfile(),
    db.select({ tmdbId: listEntries.showTmdbId }).from(listEntries),
  ]);

  const excludeIds = new Set(existing.map((e) => e.tmdbId));

  const result = process.env.ANTHROPIC_API_KEY
    ? await viaClaude(taste, excludeIds)
    : await viaTmdb(taste, excludeIds);

  return result;
}

/* ---- Strategy 1: Claude -------------------------------------------------- */

async function viaClaude(
  taste: Awaited<ReturnType<typeof getTasteProfile>>,
  excludeIds: Set<number>,
): Promise<GenerateResult> {
  const client = new Anthropic();

  const liked = taste
    .filter((t) => t.stars >= 7) // 3.5 stars and up
    .map((t) => `${t.name} — ${t.rater} gave it ${t.stars / 2}/5`);
  const disliked = taste
    .filter((t) => t.stars <= 4) // 2 stars and under
    .map((t) => `${t.name} — ${t.rater} gave it ${t.stars / 2}/5`);

  // Titles already on the list, so Claude doesn't suggest them back.
  const onList = await db
    .select({ name: shows.name })
    .from(shows)
    .where(inArray(shows.tmdbId, [...excludeIds].length ? [...excludeIds] : [-1]));

  const prompt = [
    "Two people, Greg and Hannah, watch TV together and want suggestions for what to watch next.",
    "",
    liked.length ? `Shows they rated highly:\n${liked.join("\n")}` : "They haven't rated anything highly yet.",
    disliked.length ? `\nShows they didn't get on with:\n${disliked.join("\n")}` : "",
    onList.length
      ? `\nAlready on their list — do NOT suggest these:\n${onList.map((s) => s.name).join(", ")}`
      : "",
    "",
    "Suggest TV shows they'd enjoy together. Favour things that are actually findable,",
    "and give a real reason tied to what they've liked rather than generic praise.",
    "If they haven't rated much yet, pick well-regarded, broadly appealing shows and say so.",
  ]
    .filter(Boolean)
    .join("\n");

  let parsed: z.infer<typeof SuggestionList> | null = null;

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: zodOutputFormat(SuggestionList),
        // Picking shows off a short list of ratings is not a hard reasoning
        // problem, and thinking tokens bill as output. "medium" keeps the
        // suggestions sharp while cutting the per-run cost roughly in half
        // versus the default. Raise to "high" if the picks feel lazy.
        effort: "medium",
      },
    });

    // A policy decline returns HTTP 200 with stop_reason "refusal" rather
    // than throwing, so this has to be checked before reading the output.
    if (response.stop_reason === "refusal") {
      return { added: 0, source: "claude", note: "The model declined that request." };
    }
    parsed = response.parsed_output;
  } catch (error) {
    // Most specific first — a bad key is a config problem worth surfacing
    // differently from a transient rate limit.
    if (error instanceof Anthropic.AuthenticationError) {
      return { added: 0, source: "claude", note: "ANTHROPIC_API_KEY was rejected." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { added: 0, source: "claude", note: "Rate limited — try again shortly." };
    }
    if (error instanceof Anthropic.APIError) {
      return { added: 0, source: "claude", note: `Claude API error (${error.status}).` };
    }
    throw error;
  }

  if (!parsed?.suggestions?.length) {
    return { added: 0, source: "claude", note: "No suggestions came back." };
  }

  /*
   * Claude returns titles, not TMDB ids — resolve each one by searching.
   * A title that doesn't resolve is dropped rather than guessed at: a
   * recommendation pointing at the wrong show is worse than one fewer.
   */
  let added = 0;
  for (const s of parsed.suggestions) {
    const matches = await searchShows(s.title);
    const match = pickMatch(matches, s.year);
    if (!match || excludeIds.has(match.id)) continue;

    await cacheShowSummary(match);
    const inserted = await db
      .insert(recommendations)
      .values({ showTmdbId: match.id, source: "claude", reason: s.reason })
      .onConflictDoNothing({ target: recommendations.showTmdbId })
      .returning({ id: recommendations.id });
    if (inserted.length > 0) added++;
  }

  return { added, source: "claude" };
}

/** Prefer an exact first-air-year match; fall back to TMDB's own ranking. */
function pickMatch(results: TmdbShowSummary[], year: number): TmdbShowSummary | null {
  if (results.length === 0) return null;
  const exact = results.find((r) => r.first_air_date?.startsWith(String(year)));
  return exact ?? results[0];
}

/* ---- Strategy 2: TMDB similar -------------------------------------------- */

async function viaTmdb(
  taste: Awaited<ReturnType<typeof getTasteProfile>>,
  excludeIds: Set<number>,
): Promise<GenerateResult> {
  const seeds = taste.filter((t) => t.stars >= 7).slice(0, 3);
  if (seeds.length === 0) {
    return {
      added: 0,
      source: "tmdb_similar",
      note: "Rate a few shows 3.5 stars or higher and suggestions will appear here.",
    };
  }

  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) return { added: 0, source: "tmdb_similar", note: "TMDB_ACCESS_TOKEN is not set." };

  let added = 0;
  for (const seed of seeds) {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${seed.tmdbId}/recommendations`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        next: { revalidate: 60 * 60 * 24 },
      },
    );
    if (!res.ok) continue;

    const data = (await res.json()) as { results: TmdbShowSummary[] };
    for (const show of data.results.slice(0, 4)) {
      if (excludeIds.has(show.id)) continue;
      await cacheShowSummary(show);
      const inserted = await db
        .insert(recommendations)
        .values({
          showTmdbId: show.id,
          source: "tmdb_similar",
          reason: `Because you both liked ${seed.name}.`,
        })
        .onConflictDoNothing({ target: recommendations.showTmdbId })
        .returning({ id: recommendations.id });
      if (inserted.length > 0) added++;
    }
  }

  return { added, source: "tmdb_similar" };
}
