import {
  getDb,
  getDismissedIds,
  getRatedTmdbIds,
  getCachedEngine,
  getRecommendedMovies,
  getMovies,
  getSetting,
} from "@/lib/db";
import {
  buildContext,
  engines,
  type RecConfig,
  type RecommendationGroup,
} from "@/lib/engines";

export async function GET() {
  const db = getDb();
  const dismissedIds = getDismissedIds(db);
  const ratedTmdbIds = getRatedTmdbIds(db, "movie");
  const allMovies = getMovies(db);
  const movies = allMovies.filter(
    (m) => m.source !== "recommendation" || m.wishlist,
  );
  const movieCount = movies.length;
  const configRaw = getSetting(db, "rec_config");
  const config: RecConfig | undefined = configRaw
    ? (() => { try { return JSON.parse(configRaw); } catch { return undefined; } })()
    : undefined;
  let ctx: ReturnType<typeof buildContext> | null = null;
  let total = 0;

  for (const [key, def] of Object.entries(engines)) {
    if (def.dbBacked) {
      // Count from recommended_movies directly
      const rows = getRecommendedMovies(db, key);
      total += rows.filter(
        (r) => !dismissedIds.has(r.tmdb_id) && !ratedTmdbIds.has(r.tmdb_id),
      ).length;
    } else {
      // Count from cache if available
      if (def.cacheKey && !ctx) ctx = buildContext(movies, dismissedIds, config);
      const cacheKey = def.cacheKey && ctx ? def.cacheKey(ctx) : key;
      const cacheMovieCount = def.cacheKey ? 0 : movieCount;
      const cached = getCachedEngine<RecommendationGroup>(
        db,
        cacheKey,
        cacheMovieCount,
        def.cacheMaxAgeHours ?? 24,
      );
      if (cached && (def.cacheEmptyResults !== false || cached.length > 0)) {
        for (const group of cached) {
          total += (group.recommendations || []).filter(
            (r) =>
              !dismissedIds.has(r.tmdb_id) && !ratedTmdbIds.has(r.tmdb_id),
          ).length;
        }
      }
    }
  }

  return Response.json({ total });
}
