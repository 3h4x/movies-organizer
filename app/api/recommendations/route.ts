import { NextRequest } from "next/server";
import {
  getDb,
  getMovies,
  getDismissedIds,
  getRatedTmdbIds,
  getCachedEngine,
  setCachedEngine,
  clearCachedEngine,
  saveRecommendedMovies,
  pruneRecommendedMovies,
  getRecommendedMovies,
  getSetting,
  insertMovie,
  recordImpressions,
} from "@/lib/db";
import {
  engines,
  buildContext,
  getCdaLookup,
  enrichWithCda,
  overrideTraceSource,
  type RecommendationGroup,
  type RecConfig,
} from "@/lib/engines";
import { rateLimit } from "@/lib/rate-limit";

// Engines that re-rank on prior impressions via getImpressionCounts. Recording
// impressions for engines that never read them would accumulate dead rows.
const ROTATION_AWARE_ENGINES = new Set(["hidden_gem"]);

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "tmdb");
  if (limited) return limited;
  const db = getDb();
  const engineKey = request.nextUrl.searchParams.get("engine") || "all";
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const allMovies = getMovies(db);
  // For recommendation engine context, use real library movies plus any wishlist items
  // (wishlist items added via recommendation flow have source="recommendation" but must
  // still be excluded from future recommendations).
  const movies = allMovies.filter(
    (m) => m.source !== "recommendation" || m.wishlist,
  );
  const movieCount = movies.length;
  const dismissedIds = getDismissedIds(db);
  const ratedTmdbIds = getRatedTmdbIds(db, "movie");
  const cdaLookup = getCdaLookup();
  const configRaw = getSetting(db, "rec_config");
  const config: RecConfig | undefined = configRaw
    ? (() => { try { return JSON.parse(configRaw); } catch { return undefined; } })()
    : undefined;
  const disabledRaw = getSetting(db, "disabled_engines");
  const disabledEngines: string[] = disabledRaw
    ? (() => { try { return JSON.parse(disabledRaw); } catch { return []; } })()
    : [];

  function filterExcluded(
    groups: RecommendationGroup[],
    { skipRated = false }: { skipRated?: boolean } = {},
  ): RecommendationGroup[] {
    return groups
      .map((g) => ({
        ...g,
        recommendations: g.recommendations.filter(
          (r) => !dismissedIds.has(r.tmdb_id) && (skipRated || !ratedTmdbIds.has(r.tmdb_id)),
        ),
      }))
      .filter((g) => g.recommendations.length > 0);
  }

  function enrichFromDb(
    groups: RecommendationGroup[],
    engine: string,
  ): RecommendationGroup[] {
    const dbRows = getRecommendedMovies(db, engine);
    const enrichMap = new Map(dbRows.map((r) => [r.tmdb_id, r]));
    return groups.map((g) => ({
      ...g,
      recommendations: g.recommendations.map((r) => {
        const dbRow = enrichMap.get(r.tmdb_id);
        return dbRow
          ? { ...r, pl_title: dbRow.pl_title, cda_url: dbRow.cda_url }
          : r;
      }),
    }));
  }

  function addCdaUrls(groups: RecommendationGroup[]): RecommendationGroup[] {
    return groups.map((g) => ({
      ...g,
      recommendations: enrichWithCda(g.recommendations, cdaLookup),
    }));
  }

  function persistResults(groups: RecommendationGroup[]): void {
    // Remove stale entries per engine before inserting — preserves enrichment
    // data (pl_title, cda_url) on movies still in the new results.
    const keepByEngine = new Map<string, number[]>();
    for (const group of groups) {
      const ids = keepByEngine.get(group.type) ?? [];
      for (const r of group.recommendations) ids.push(r.tmdb_id);
      keepByEngine.set(group.type, ids);
    }
    for (const [engine, keepIds] of keepByEngine) {
      pruneRecommendedMovies(db, engine, keepIds);
    }
    for (const group of groups) {
      saveRecommendedMovies(
        db,
        group.type,
        group.reason,
        group.recommendations,
      );
      // Store in main movies table — insertMovie dedup prevents duplicates
      for (const rec of group.recommendations) {
        insertMovie(db, {
          title: rec.title,
          year: rec.year,
          genre: rec.genre,
          director: null,
          rating: rec.rating,
          poster_url: rec.poster_url,
          source: "recommendation",
          imdb_id: null,
          tmdb_id: rec.tmdb_id,
          type: "movie",
        });
      }
    }
  }

  async function runEngine(
    key: string,
    def: (typeof engines)[string],
  ): Promise<RecommendationGroup[]> {
    try {
      // DB-backed engines skip cache
      if (def.dbBacked) {
        const ctx = buildContext(movies, dismissedIds, config);
        return addCdaUrls(filterExcluded(await def.engine(ctx)));
      }

      // noCache engines always fetch fresh (e.g. Surprise Me) — don't exclude rated movies
      if (def.noCache) {
        const ctx = buildContext(movies, dismissedIds, config);
        return addCdaUrls(filterExcluded(await def.engine(ctx), { skipRated: true }));
      }

      const ctx = buildContext(movies, dismissedIds, config);
      const cacheKey = def.cacheKey?.(ctx) ?? key;
      const cacheMovieCount = def.cacheKey ? 0 : movieCount;
      const cacheMaxAgeHours = def.cacheMaxAgeHours ?? 24;

      if (refresh) {
        clearCachedEngine(db, key);
        if (cacheKey !== key) clearCachedEngine(db, cacheKey);
      }

      const cached = getCachedEngine(
        db,
        cacheKey,
        cacheMovieCount,
        cacheMaxAgeHours,
      );
      if (cached && (def.cacheEmptyResults !== false || cached.length > 0)) {
        return addCdaUrls(
          filterExcluded(
            overrideTraceSource(
              enrichFromDb(cached as RecommendationGroup[], key),
              "recommendation_cache",
            ),
          ),
        );
      }

      const groups = await def.engine(ctx);
      if (def.cacheEmptyResults !== false || groups.length > 0) {
        setCachedEngine(db, cacheKey, groups, cacheMovieCount);
      }
      if (groups.length > 0) {
        persistResults(groups);
      }
      return addCdaUrls(filterExcluded(groups));
    } catch (err) {
      console.error(`[Recommendations] engine "${key}" failed:`, err);
      return [];
    }
  }

  function applyMaxPerGroup(
    groups: RecommendationGroup[],
  ): RecommendationGroup[] {
    const max = config?.max_per_group ?? 15;
    return groups.map((g) => ({
      ...g,
      recommendations: g.recommendations.slice(0, max),
    }));
  }

  function recordImpressionsForGroups(groups: RecommendationGroup[]): void {
    const byEngine = new Map<string, number[]>();
    for (const g of groups) {
      if (!ROTATION_AWARE_ENGINES.has(g.type)) continue;
      const ids = byEngine.get(g.type) ?? [];
      for (const r of g.recommendations) ids.push(r.tmdb_id);
      byEngine.set(g.type, ids);
    }
    for (const [engine, ids] of byEngine) {
      try {
        recordImpressions(db, engine, ids);
      } catch (err) {
        console.error(`[Recommendations] recordImpressions failed for "${engine}":`, err);
      }
    }
  }

  // Single engine request
  if (engineKey !== "all" && engines[engineKey]) {
    if (disabledEngines.includes(engineKey)) {
      return Response.json([]);
    }
    const groups = await runEngine(engineKey, engines[engineKey]);
    const final = applyMaxPerGroup(groups);
    recordImpressionsForGroups(final);
    return Response.json(final);
  }

  // All engines
  const allGroups: RecommendationGroup[] = [];
  for (const [key, def] of Object.entries(engines)) {
    if (disabledEngines.includes(key)) continue;
    const groups = await runEngine(key, def);
    allGroups.push(...groups);
  }

  const final = applyMaxPerGroup(allGroups);
  recordImpressionsForGroups(final);
  return Response.json(final);
}
