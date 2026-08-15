// tamtam inspected 2026-05-21
import { discoverByMood } from "../tmdb";
import type { TmdbSearchResult } from "../tmdb";
import { filterResults, type EngineContext, type RecommendationGroup } from "./index";
import { MOOD_PRESETS, type MoodKey } from "../mood-presets";


export async function moodEngine(
  ctx: EngineContext,
  moodKey: MoodKey,
): Promise<RecommendationGroup[]> {
  const preset = MOOD_PRESETS[moodKey];

  if (preset.comfortRewatch) {
    const picks = ctx.library
      .filter((m) => {
        if (!m.tmdb_id || ctx.dismissedIds.has(m.tmdb_id)) return false;
        if (m.user_rating != null && m.user_rating >= 8) return true;
        if ((m.user_rating == null || m.user_rating === 0) && m.rating != null && m.rating >= 7) return true;
        return false;
      })
      .sort((a, b) => {
        const ra = a.user_rating ?? a.rating ?? 0;
        const rb = b.user_rating ?? b.rating ?? 0;
        return rb - ra;
      })
      .slice(0, 30)
      .map(
        (m): TmdbSearchResult => ({
          title: m.title,
          year: m.year,
          genre: m.genre || "",
          rating: m.rating ?? 0,
          poster_url: m.poster_url,
          tmdb_id: m.tmdb_id!,
          imdb_id: m.imdb_id,
          pl_title: m.pl_title,
        }),
      );

    if (picks.length === 0) return [];
    return [{ reason: preset.reason, type: "mood", recommendations: picks }];
  }

  const results = await discoverByMood({
    genreIds: preset.genreIds,
    minRating: preset.minRating,
    minVotes: preset.minVotes,
    maxRuntime: preset.maxRuntime,
    languages: preset.languages,
    pages: 3,
  });

  const filtered = filterResults(results, ctx);
  if (filtered.length === 0) return [];

  return [
    {
      reason: preset.reason,
      type: "mood",
      recommendations: filtered.slice(0, 30),
    },
  ];
}
