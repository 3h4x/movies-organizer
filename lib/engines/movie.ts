import { getTmdbRecommendations, getTmdbSimilar } from "../tmdb";
import {
  attachTrace,
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function movieEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const seedMinRating = ctx.config?.movie_seed_min_rating ?? 7;
  const seedCount = ctx.config?.movie_seed_count ?? 10;
  const useSimilar = ctx.config?.use_tmdb_similar ?? true;

  const seeds = ctx.library
    .filter((m) => m.tmdb_id && (m.user_rating ?? 0) >= seedMinRating)
    .sort((a, b) => (b.user_rating ?? 0) - (a.user_rating ?? 0))
    .slice(0, seedCount);

  const recResultsPromise = Promise.allSettled(
    seeds.map((m) => getTmdbRecommendations(m.tmdb_id!)),
  );
  const similarResultsPromise = useSimilar
    ? Promise.allSettled(seeds.map((m) => getTmdbSimilar(m.tmdb_id!)))
    : Promise.resolve(null);

  const [recResults, similarResults] = await Promise.all([
    recResultsPromise,
    similarResultsPromise,
  ]);

  const groups: RecommendationGroup[] = [];
  recResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const combined = [...result.value];
    if (similarResults) {
      const similar = similarResults[i];
      if (similar.status === "fulfilled") {
        const seen = new Set<number>();
        for (const r of result.value) seen.add(r.tmdb_id);
        for (const r of similar.value) {
          if (!seen.has(r.tmdb_id)) combined.push(r);
        }
      }
    }
    const filtered = filterResults(combined, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Because you loved ${seeds[i].title}`,
        type: "movie",
        recommendations: attachTrace(filtered, {
          engine: "movie",
          seedKind: "movie",
          seedTmdbId: seeds[i].tmdb_id,
          seedTitle: seeds[i].title,
        }),
      });
    }
  });
  return groups;
}
