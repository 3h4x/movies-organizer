import { discoverHiddenGems, genreNameToId } from "../tmdb";
import { parseGenreLabels } from "../utils";
import { getDb, getImpressionCounts } from "../db";
import {
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

// Strength of the impression penalty. With weight=0.5 a movie shown 5 times in
// the last 14 days drops by ~1.3 rating points — enough to demote a borderline
// match below a fresh one, but not enough to bury a strongly-matched title.
const IMPRESSION_PENALTY_WEIGHT = 0.5;

export async function hiddenGemEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  // Find top genre for targeted gems
  const genreScores = new Map<string, number>();
  for (const movie of ctx.library) {
    if (!movie.genre) continue;
    const weight = movie.user_rating ?? 5;
    if (weight < 5) continue;
    for (const genre of parseGenreLabels(movie.genre)) {
      if (genre && genre !== "Unknown") {
        genreScores.set(genre, (genreScores.get(genre) || 0) + weight);
      }
    }
  }

  let topGenre: [string, number] | undefined;
  for (const entry of genreScores) {
    if (!topGenre || entry[1] > topGenre[1]) topGenre = entry;
  }
  const genreId = topGenre ? genreNameToId(topGenre[0]) : null;

  const gems = await discoverHiddenGems(genreId ?? undefined);
  const filtered = filterResults(gems, ctx);
  if (filtered.length === 0) return [];

  let impressions = new Map<number, number>();
  try {
    impressions = getImpressionCounts(
      getDb(),
      "hidden_gem",
      filtered.map((r) => r.tmdb_id),
    );
  } catch {
    // Impression tracking is best-effort — fall back to no penalty if the
    // lookup fails (e.g. test mocks where getDb returns a stub).
  }
  const scored = filtered.map((r) => ({
    r,
    score:
      r.rating -
      Math.log(1 + (impressions.get(r.tmdb_id) ?? 0)) * IMPRESSION_PENALTY_WEIGHT,
  }));
  scored.sort((a, b) => b.score - a.score);
  const ranked = scored.map((s) => s.r);

  return [
    {
      reason: topGenre
        ? `Hidden ${topGenre[0]} gems`
        : "Hidden gems you might have missed",
      type: "hidden_gem",
      recommendations: ranked.slice(0, 15),
    },
  ];
}
