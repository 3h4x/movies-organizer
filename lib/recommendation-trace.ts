// tamtam inspected 2026-05-21
export type RecommendationSourceKind =
  | "live_tmdb"
  | "recommendation_cache"
  | "recommended_movies";

export type RecommendationSeedKind =
  | "director"
  | "actor"
  | "genre"
  | "movie"
  | "franchise"
  | "cda";

export interface RecommendationTrace {
  engine: string;
  source: RecommendationSourceKind;
  seedKind?: RecommendationSeedKind;
  seedId?: number | null;
  seedName?: string | null;
  seedTmdbId?: number | null;
  seedTitle?: string | null;
}
