import { createHash } from "crypto";
import type { Movie } from "@/lib/db";
import type { EngineContext, RecommendationGroup } from "@/lib/engines";
import { discoverAiCandidates, type TmdbSearchResult } from "@/lib/tmdb";
import { parseGenreLabels } from "@/lib/utils";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_CANDIDATES = 30;
const MAX_PICKS = 10;

interface AnthropicUsage {
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[];
  usage?: AnthropicUsage;
}

export interface AiPick {
  tmdb_id: number;
  reason: string;
  score: number;
}

interface CountedName {
  name: string;
  score: number;
}

function topEntries(map: Map<string, number>, limit: number): CountedName[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, score]) => ({ name, score: Math.round(score * 10) / 10 }));
}

function splitPeople(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function weightFor(movie: Movie): number {
  return movie.user_rating ?? movie.rating ?? 5;
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[\s\u200b-\u200d\ufeff]+/g, " ").trim();
}

function filterCandidates(
  results: TmdbSearchResult[],
  ctx: EngineContext,
): TmdbSearchResult[] {
  const seen = new Set<number>();
  const excludedGenres = ctx.config?.excluded_genres?.length
    ? new Set(ctx.config.excluded_genres.map((genre) => genre.toLowerCase()))
    : null;

  return results.filter((movie) => {
    if (ctx.libraryTmdbIds.has(movie.tmdb_id)) return false;
    if (ctx.libraryTitles.has(normalizeTitle(movie.title))) return false;
    if (ctx.dismissedIds.has(movie.tmdb_id)) return false;
    if (seen.has(movie.tmdb_id)) return false;
    if (ctx.config?.min_year && movie.year && movie.year < ctx.config.min_year) return false;
    if (ctx.config?.min_rating && movie.rating < ctx.config.min_rating) return false;
    if (
      excludedGenres &&
      parseGenreLabels(movie.genre).some((genre) =>
        excludedGenres.has(genre.toLowerCase()),
      )
    ) {
      return false;
    }
    seen.add(movie.tmdb_id);
    return true;
  });
}

export function buildAiTasteProfile(
  library: Movie[],
  dismissedIds: Set<number>,
): string {
  const rated = library
    .filter((movie) => movie.user_rating != null || movie.rating != null)
    .sort(
      (a, b) =>
        (weightFor(b) - weightFor(a)) ||
        (b.rated_at ?? b.created_at).localeCompare(a.rated_at ?? a.created_at),
    );
  const genreScores = new Map<string, number>();
  const directorScores = new Map<string, number>();
  const actorScores = new Map<string, number>();

  for (const movie of rated) {
    const weight = weightFor(movie);
    for (const genre of parseGenreLabels(movie.genre ?? "")) {
      genreScores.set(genre, (genreScores.get(genre) ?? 0) + weight);
    }
    for (const director of splitPeople(movie.director)) {
      directorScores.set(director, (directorScores.get(director) ?? 0) + weight);
    }
    for (const actor of splitPeople(movie.actors)) {
      actorScores.set(actor, (actorScores.get(actor) ?? 0) + weight);
    }
  }

  const wishlist = library
    .filter((movie) => movie.wishlist)
    .slice(0, 20)
    .map((movie) => ({
      title: movie.title,
      year: movie.year,
      genres: parseGenreLabels(movie.genre ?? ""),
    }));

  const recentRatings = [...rated]
    .sort((a, b) => (b.rated_at ?? b.created_at).localeCompare(a.rated_at ?? a.created_at))
    .slice(0, 15)
    .map((movie) => ({
      title: movie.title,
      year: movie.year,
      user_rating: movie.user_rating,
      tmdb_rating: movie.rating,
      genres: parseGenreLabels(movie.genre ?? ""),
    }));

  return JSON.stringify({
    top_rated: rated.slice(0, 20).map((movie) => ({
      title: movie.title,
      year: movie.year,
      user_rating: movie.user_rating,
      tmdb_rating: movie.rating,
      director: movie.director,
      genres: parseGenreLabels(movie.genre ?? ""),
    })),
    recent_ratings: recentRatings,
    top_genres: topEntries(genreScores, 10),
    top_directors: topEntries(directorScores, 10),
    top_actors: topEntries(actorScores, 12),
    wishlist,
    dismissed_tmdb_ids: [...dismissedIds].slice(0, 100).sort((a, b) => a - b),
  });
}

export function getAiProfileHash(ctx: EngineContext): string {
  const effectiveConfig = {
    excluded_genres: [...(ctx.config?.excluded_genres ?? [])]
      .map((genre) => genre.trim().toLowerCase())
      .sort(),
    min_rating: ctx.config?.min_rating ?? null,
    min_year: ctx.config?.min_year ?? null,
  };
  return createHash("sha256")
    .update(buildAiTasteProfile(ctx.library, ctx.dismissedIds))
    .update(JSON.stringify(effectiveConfig))
    .digest("hex")
    .slice(0, 16);
}

export function buildAiPrompt(
  profile: string,
  candidates: TmdbSearchResult[],
): {
  system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];
  user: string;
} {
  const candidateJson = JSON.stringify(
    candidates.map((movie) => ({
      tmdb_id: movie.tmdb_id,
      title: movie.title,
      year: movie.year,
      genres: parseGenreLabels(movie.genre),
      tmdb_rating: movie.rating,
    })),
  );

  return {
    system: [
      {
        type: "text",
        text: "You recommend movies for one user. Return only valid JSON with no prose. Pick movies that fit the taste profile, avoid explaining generic popularity, and keep each reason personal and specific.",
      },
      {
        type: "text",
        text: `Taste profile JSON:\n${profile}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    user: `Choose 5 to 10 movies from this candidate JSON. Return an array of objects with tmdb_id, score from 0 to 100, and reason as one sentence under 160 characters.\n${candidateJson}`,
  };
}

export function parseAiResponse(text: string, allowedIds: Set<number>): AiPick[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<number>();
  const picks: AiPick[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as { tmdb_id?: unknown; reason?: unknown; score?: unknown };
    if (typeof record.tmdb_id !== "number" || !allowedIds.has(record.tmdb_id)) continue;
    if (seen.has(record.tmdb_id) || typeof record.reason !== "string") continue;
    const reason = record.reason.trim();
    if (!reason) continue;
    const score =
      typeof record.score === "number" && Number.isFinite(record.score)
        ? Math.max(0, Math.min(100, record.score))
        : 50;
    seen.add(record.tmdb_id);
    picks.push({ tmdb_id: record.tmdb_id, reason, score });
    if (picks.length >= MAX_PICKS) break;
  }
  return picks;
}

export async function callAnthropicRecommendations(
  profile: string,
  candidates: TmdbSearchResult[],
  apiKey: string,
): Promise<AiPick[]> {
  const prompt = buildAiPrompt(profile, candidates);
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      temperature: 0.2,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[AI recommendations] Anthropic failed: ${response.status} ${response.statusText}`, body);
    return [];
  }

  const data = (await response.json()) as AnthropicResponse;
  const usage = data.usage ?? {};
  const read = usage.cache_read_input_tokens ?? 0;
  const created = usage.cache_creation_input_tokens ?? 0;
  const cacheTotal = read + created;
  const hitRate = cacheTotal > 0 ? Math.round((read / cacheTotal) * 100) : 0;
  console.info(
    `[AI recommendations] Anthropic prompt cache read=${read} creation=${created} hit_rate=${hitRate}%`,
  );

  const text = data.content?.find((block) => block.type === "text")?.text ?? "";
  return parseAiResponse(text, new Set(candidates.map((movie) => movie.tmdb_id)));
}

export async function aiEngine(ctx: EngineContext): Promise<RecommendationGroup[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const candidates = filterCandidates(await discoverAiCandidates(), ctx).slice(
    0,
    MAX_CANDIDATES,
  );
  if (candidates.length === 0) return [];

  const profile = buildAiTasteProfile(ctx.library, ctx.dismissedIds);
  const picks = await callAnthropicRecommendations(profile, candidates, apiKey);
  const byId = new Map(candidates.map((movie) => [movie.tmdb_id, movie]));
  const recommendations: TmdbSearchResult[] = picks
    .flatMap((pick) => {
      const movie = byId.get(pick.tmdb_id);
      return movie ? [{ ...movie, reason: pick.reason, score: pick.score }] : [];
    });

  if (recommendations.length === 0) return [];

  return [
    {
      reason: "For you",
      type: "ai",
      recommendations: recommendations.map((movie) => ({
        ...movie,
        trace: { engine: "ai", source: "live_tmdb" },
      })),
    },
  ];
}
