import type { Movie } from "../db";
import type { TmdbSearchResult } from "../tmdb";
import type {
  RecommendationSourceKind,
  RecommendationTrace,
} from "../recommendation-trace";
import { genreEngine } from "./genre";
import { directorEngine } from "./director";
import { actorEngine } from "./actor";
import { movieEngine } from "./movie";
import { franchiseEngine } from "./franchise";
import { hiddenGemEngine } from "./hidden-gem";
import { starStuddedEngine } from "./star-studded";
import { randomEngine } from "./random";
import { getDb, getRecommendedMovies } from "../db";
import { cdaEngine } from "./cda";
import { watchlistEngine } from "./watchlist";
import { aiEngine, getAiProfileHash } from "./ai";
import { parseGenreLabels } from "../utils";

// Normalize a title for set-membership comparison: lowercase, collapse all whitespace
// including zero-width variants TMDb sometimes embeds (U+200B zero-width space through
// U+200D zero-width joiner, plus U+FEFF BOM/ZWNBSP). \s already covers regular whitespace
// and U+00A0 non-breaking space.
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[\s\u200b-\u200d\ufeff]+/g, " ").trim();
}

export interface RecommendationGroup {
  reason: string;
  type: string;
  recommendations: TmdbSearchResult[];
}

export interface RecConfig {
  excluded_genres: string[];
  min_year: number | null;
  min_rating: number | null;
  max_per_group: number;
  // Engine tuning (all optional — engines fall back to sensible defaults)
  movie_seed_min_rating?: number;
  movie_seed_count?: number;
  use_tmdb_similar?: boolean;
  actor_min_appearances?: number;
  director_min_films?: number;
  top_genre_count?: number;
}

export interface EngineContext {
  library: Movie[];
  dismissedIds: Set<number>;
  libraryTmdbIds: Set<number>;
  libraryTitles: Set<string>;
  config?: RecConfig;
}

export type RecommendationEngine = (
  ctx: EngineContext,
) => Promise<RecommendationGroup[]>;

export interface EngineDefinition {
  name: string;
  icon: string;
  engine: RecommendationEngine;
  dbBacked?: boolean; // Skip recommendation_cache, reads from recommended_movies directly
  noCache?: boolean; // Always fetch fresh results (never cache)
  cacheKey?: (ctx: EngineContext) => string;
  cacheMaxAgeHours?: number;
  cacheEmptyResults?: boolean;
}

function franchiseCacheKey(ctx: EngineContext): string {
  const libraryIds = [...ctx.libraryTmdbIds].sort((a, b) => a - b).join(",");
  const collections = ctx.library
    .filter((movie) => movie.tmdb_collection_id && movie.tmdb_collection_name)
    .map((movie) => `${movie.tmdb_collection_id}:${movie.tmdb_collection_name}`)
    .sort()
    .join("|");
  return `franchise:${libraryIds}:${collections}`;
}

export const engines: Record<string, EngineDefinition> = {
  ai: {
    name: "For You",
    icon: "✨",
    engine: aiEngine,
    cacheKey: (ctx) => `ai:${getAiProfileHash(ctx)}`,
    cacheMaxAgeHours: 24 * 7,
    cacheEmptyResults: false,
  },
  random: { name: "Surprise Me", icon: "🎲", engine: randomEngine, noCache: true },
  genre: { name: "By Genre", icon: "🎭", engine: genreEngine },
  director: { name: "By Director", icon: "🎬", engine: directorEngine },
  actor: { name: "By Actor", icon: "⭐", engine: actorEngine },
  movie: { name: "Similar", icon: "💡", engine: movieEngine },
  franchise: {
    name: "Franchises",
    icon: "🎞️",
    engine: franchiseEngine,
    cacheKey: franchiseCacheKey,
    cacheEmptyResults: false,
  },
  hidden_gem: { name: "Hidden Gems", icon: "💎", engine: hiddenGemEngine },
  star_studded: { name: "Star-Studded", icon: "🌟", engine: starStuddedEngine },
  cda: { name: "On CDA", icon: "📺", engine: cdaEngine, dbBacked: true },
  watchlist: { name: "From Watchlist", icon: "🔖", engine: watchlistEngine },
};

// Build a lookup of CDA URLs by tmdb_id and title
export function getCdaLookup(): {
  byTmdbId: Map<number, string>;
  byTitle: Map<string, string>;
} {
  const db = getDb();
  const cdaMovies = getRecommendedMovies(db, "cda");
  const byTmdbId = new Map<number, string>();
  const byTitle = new Map<string, string>();
  for (const m of cdaMovies) {
    if (m.cda_url) {
      if (m.tmdb_id) byTmdbId.set(m.tmdb_id, m.cda_url);
      byTitle.set(m.title.toLowerCase(), m.cda_url);
      if (m.pl_title) byTitle.set(m.pl_title.toLowerCase(), m.cda_url);
    }
  }
  return { byTmdbId, byTitle };
}

export function enrichWithCda(
  results: TmdbSearchResult[],
  cdaLookup: { byTmdbId: Map<number, string>; byTitle: Map<string, string> },
): TmdbSearchResult[] {
  return results.map((r) => {
    const cdaUrl =
      cdaLookup.byTmdbId.get(r.tmdb_id) ||
      cdaLookup.byTitle.get(r.title.toLowerCase());
    if (cdaUrl) return { ...r, cda_url: cdaUrl };
    return r;
  });
}

export function attachTrace(
  results: TmdbSearchResult[],
  trace: Omit<RecommendationTrace, "source"> & {
    source?: RecommendationSourceKind;
  },
): TmdbSearchResult[] {
  return results.map((result) => ({
    ...result,
    trace: {
      ...trace,
      source: trace.source ?? "live_tmdb",
    },
  }));
}

export function overrideTraceSource(
  groups: RecommendationGroup[],
  source: RecommendationSourceKind,
): RecommendationGroup[] {
  return groups.map((group) => ({
    ...group,
    recommendations: group.recommendations.map((recommendation) =>
      recommendation.trace
        ? {
            ...recommendation,
            trace: {
              ...recommendation.trace,
              source,
            },
          }
        : recommendation,
    ),
  }));
}

export function buildContext(
  library: Movie[],
  dismissedIds: Set<number>,
  config?: RecConfig,
): EngineContext {
  return {
    library,
    dismissedIds,
    libraryTmdbIds: new Set(
      library.map((m) => m.tmdb_id).filter(Boolean) as number[],
    ),
    libraryTitles: new Set([
      ...library.map((m) => normalizeTitle(m.title)),
      ...library.flatMap((m) => (m.pl_title ? [normalizeTitle(m.pl_title)] : [])),
    ]),
    config,
  };
}

export function filterResults(
  results: TmdbSearchResult[],
  ctx: EngineContext,
  seen: Set<number> = new Set(),
): TmdbSearchResult[] {
  const cfg = ctx.config;
  const excludedGenres = cfg?.excluded_genres?.length
    ? new Set(cfg.excluded_genres.map((g) => g.toLowerCase()))
    : null;

  return results.filter((r) => {
    if (ctx.libraryTmdbIds.has(r.tmdb_id)) return false;
    if (ctx.libraryTitles.has(normalizeTitle(r.title))) return false;
    if (ctx.dismissedIds.has(r.tmdb_id)) return false;
    if (seen.has(r.tmdb_id)) return false;
    if (cfg?.min_year && r.year && r.year < cfg.min_year) return false;
    if (cfg?.min_rating && r.rating < cfg.min_rating) return false;
    if (excludedGenres && r.genre) {
      if (parseGenreLabels(r.genre).some((g) => excludedGenres.has(g.toLowerCase()))) return false;
    }
    seen.add(r.tmdb_id);
    return true;
  });
}
