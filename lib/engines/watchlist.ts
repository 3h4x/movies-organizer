// tamtam inspected 2026-05-21
import { getTmdbRecommendations } from "../tmdb";
import {
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function watchlistEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const seeds: { title: string; tmdbId: number }[] = [];
  for (const movie of ctx.library) {
    if (movie.tmdb_id && movie.wishlist === 1) {
      seeds.push({ title: movie.title, tmdbId: movie.tmdb_id });
      if (seeds.length === 8) break;
    }
  }

  if (seeds.length === 0) return [];

  const recResults = await Promise.allSettled(
    seeds.map((m) => getTmdbRecommendations(m.tmdbId)),
  );
  const groups: RecommendationGroup[] = [];
  recResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const filtered = filterResults(result.value, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Because you want to watch "${seeds[i].title}"`,
        type: "watchlist",
        recommendations: filtered,
      });
    }
  });
  return groups;
}
