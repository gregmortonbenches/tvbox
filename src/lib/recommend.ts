import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { listEntries, recommendations, titles } from "./db/schema";
import { getTasteProfile } from "./queries";
import { cacheTitleSummary } from "./cache";
import { getSimilar, searchTitles, type TitleSummary } from "./tmdb";

/*
 * "A section where you recommend things to us."
 *
 * Two strategies, picked at runtime:
 *   1. ANTHROPIC_API_KEY set -> ask Claude, given what you've both rated and
 *      what's already listed. Better picks, because it can reason about *why*
 *      you liked something rather than matching metadata.
 *   2. No key -> TMDB's own "recommendations" endpoint seeded from your
 *      highest-rated titles. No extra account needed, just blunter.
 *
 * Either way the output is rows in `recommendations` with a readable
 * `reason`, so the page can say why something was suggested.
 */

const SuggestionList = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().describe("The title, as commonly known in English"),
        year: z.number().describe("Year of first release, to disambiguate remakes"),
        mediaType: z.enum(["tv", "film"]).describe("Whether this is a TV series or a film"),
        reason: z
          .string()
          .describe("One or two sentences, addressed to the pair, on why they'd like it"),
      }),
    )
    .describe("Between 5 and 8 suggestions, a mix of TV and film unless their taste skews one way"),
});

export type GenerateResult = {
  added: number;
  source: "claude" | "tmdb_similar";
  note?: string;
};

export async function generateRecommendations(): Promise<GenerateResult> {
  const [taste, listed] = await Promise.all([
    getTasteProfile(),
    db
      .select({ titleId: listEntries.titleId, name: titles.name })
      .from(listEntries)
      .innerJoin(titles, eq(titles.id, listEntries.titleId)),
  ]);

  const excludeTitleIds = new Set(listed.map((e) => e.titleId));

  return process.env.ANTHROPIC_API_KEY
    ? viaClaude(taste, listed, excludeTitleIds)
    : viaTmdb(taste, excludeTitleIds);
}

/* ---- Strategy 1: Claude -------------------------------------------------- */

async function viaClaude(
  taste: Awaited<ReturnType<typeof getTasteProfile>>,
  listed: { name: string }[],
  excludeTitleIds: Set<string>,
): Promise<GenerateResult> {
  const client = new Anthropic();

  const label = (t: (typeof taste)[number]) =>
    `${t.name} (${t.mediaType === "film" ? "film" : "TV"}) — ${t.rater} gave it ${t.stars / 2}/5`;

  const liked = taste.filter((t) => t.stars >= 7).map(label);
  const disliked = taste.filter((t) => t.stars <= 4).map(label);

  const prompt = [
    "Two people, Greg and Hannah, watch TV and films together and want suggestions for what to watch next.",
    "",
    liked.length ? `Rated highly:\n${liked.join("\n")}` : "They haven't rated anything highly yet.",
    disliked.length ? `\nDidn't get on with:\n${disliked.join("\n")}` : "",
    listed.length
      ? `\nAlready on their list — do NOT suggest these:\n${listed.map((s) => s.name).join(", ")}`
      : "",
    "",
    "Suggest things they'd enjoy together — TV series or films, whichever fits.",
    "Favour things that are actually findable, and give a real reason tied to what",
    "they've liked rather than generic praise. If they haven't rated much yet, pick",
    "well-regarded, broadly appealing titles and say so.",
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
        // Picking titles off a short list of ratings is not a hard reasoning
        // problem, and thinking tokens bill as output. "medium" keeps the
        // suggestions sharp while roughly halving the per-run cost versus the
        // default. Raise to "high" if the picks feel lazy.
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
   * Claude returns titles, not TMDB ids — resolve each by searching the right
   * endpoint for its media type. A title that doesn't resolve is DROPPED, not
   * guessed at: a recommendation pointing at the wrong thing is worse than
   * one fewer.
   */
  let added = 0;
  for (const s of parsed.suggestions) {
    const matches = await searchTitles(s.title, s.mediaType);
    const match = pickMatch(matches, s.year);
    if (!match) continue;

    const titleId = await cacheTitleSummary(match);
    if (excludeTitleIds.has(titleId)) continue;

    const inserted = await db
      .insert(recommendations)
      .values({ titleId, source: "claude", reason: s.reason })
      .onConflictDoNothing({ target: recommendations.titleId })
      .returning({ id: recommendations.id });
    if (inserted.length > 0) added++;
  }

  return { added, source: "claude" };
}

/** Prefer an exact release-year match; fall back to TMDB's own ranking. */
function pickMatch(results: TitleSummary[], year: number): TitleSummary | null {
  if (results.length === 0) return null;
  return results.find((r) => r.releaseDate?.startsWith(String(year))) ?? results[0];
}

/* ---- Strategy 2: TMDB similar -------------------------------------------- */

async function viaTmdb(
  taste: Awaited<ReturnType<typeof getTasteProfile>>,
  excludeTitleIds: Set<string>,
): Promise<GenerateResult> {
  const seeds = taste.filter((t) => t.stars >= 7).slice(0, 3);
  if (seeds.length === 0) {
    return {
      added: 0,
      source: "tmdb_similar",
      note: "Rate a few things 3.5 stars or higher and suggestions will appear here.",
    };
  }
  if (!process.env.TMDB_ACCESS_TOKEN) {
    return { added: 0, source: "tmdb_similar", note: "TMDB_ACCESS_TOKEN is not set." };
  }

  let added = 0;
  for (const seed of seeds) {
    let similar: TitleSummary[] = [];
    try {
      similar = await getSimilar(seed.tmdbId, seed.mediaType);
    } catch {
      continue; // one dud seed shouldn't abort the whole refresh
    }

    for (const candidate of similar.slice(0, 4)) {
      const titleId = await cacheTitleSummary(candidate);
      if (excludeTitleIds.has(titleId)) continue;

      const inserted = await db
        .insert(recommendations)
        .values({
          titleId,
          source: "tmdb_similar",
          reason: `Because you both liked ${seed.name}.`,
        })
        .onConflictDoNothing({ target: recommendations.titleId })
        .returning({ id: recommendations.id });
      if (inserted.length > 0) added++;
    }
  }

  return { added, source: "tmdb_similar" };
}
