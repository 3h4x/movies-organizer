// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "@/lib/engines";
import type { Movie } from "@/lib/db";
import type { TmdbSearchResult } from "@/lib/tmdb";

const {
  mockGetTmdbRecommendations,
  mockGetTmdbSimilar,
  mockGetMovieCredits,
  mockDiscoverByPerson,
} = vi.hoisted(() => ({
  mockGetTmdbRecommendations: vi.fn(),
  mockGetTmdbSimilar: vi.fn(),
  mockGetMovieCredits: vi.fn(),
  mockDiscoverByPerson: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  getTmdbRecommendations: mockGetTmdbRecommendations,
  getTmdbSimilar: mockGetTmdbSimilar,
  getMovieCredits: mockGetMovieCredits,
  discoverByPerson: mockDiscoverByPerson,
}));

import { movieEngine } from "@/lib/engines/movie";
import { actorEngine } from "@/lib/engines/actor";
import { directorEngine } from "@/lib/engines/director";

function makeMovie(overrides: Partial<Movie> & { id: number; title: string }): Movie {
  return {
    year: 2010,
    genre: "Drama",
    director: null,
    rating: 7.5,
    poster_url: null,
    source: "tmdb",
    imdb_id: null,
    tmdb_id: overrides.id * 100,
    type: "movie",
    file_path: null,
    created_at: "2026-01-01",
    ...overrides,
  } as Movie;
}

function makeResult(
  overrides: Partial<TmdbSearchResult> & { tmdb_id: number; title: string },
): TmdbSearchResult {
  return {
    year: 2020,
    genre: "Drama",
    rating: 7.5,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetTmdbRecommendations.mockResolvedValue([]);
  mockGetTmdbSimilar.mockResolvedValue([]);
  mockGetMovieCredits.mockResolvedValue({ directors: [], cast: [] });
  mockDiscoverByPerson.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// movieEngine
// ---------------------------------------------------------------------------

describe("movieEngine", () => {
  it("returns empty when library has no rated movies", async () => {
    const ctx = buildContext([makeMovie({ id: 1, title: "Film" })], new Set());
    expect(await movieEngine(ctx)).toEqual([]);
  });

  it("returns empty when library is empty", async () => {
    expect(await movieEngine(buildContext([], new Set()))).toEqual([]);
  });

  it("generates groups from recommendations", async () => {
    const library = [makeMovie({ id: 1, title: "Inception", user_rating: 9, tmdb_id: 27205 })];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 329865, title: "Arrival" }),
    ]);

    const result = await movieEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("Inception");
    expect(result[0].type).toBe("movie");
    expect(result[0].recommendations[0].title).toBe("Arrival");
    expect(result[0].recommendations[0].trace).toMatchObject({
      engine: "movie",
      source: "live_tmdb",
      seedKind: "movie",
      seedTmdbId: 27205,
      seedTitle: "Inception",
    });
  });

  it("merges similar results with recommendations, deduplicating by tmdb_id", async () => {
    const library = [makeMovie({ id: 1, title: "Inception", user_rating: 9, tmdb_id: 27205 })];
    const ctx = buildContext(library, new Set());

    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Film A" }),
    ]);
    mockGetTmdbSimilar.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Film A" }), // duplicate — should be dropped
      makeResult({ tmdb_id: 200, title: "Film B" }),
    ]);

    const result = await movieEngine(ctx);
    expect(result).toHaveLength(1);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).toContain("Film A");
    expect(titles).toContain("Film B");
    expect(titles.filter((t) => t === "Film A")).toHaveLength(1);
  });

  it("skips similar lookup when use_tmdb_similar=false", async () => {
    const library = [makeMovie({ id: 1, title: "Inception", user_rating: 9, tmdb_id: 27205 })];
    const ctx = buildContext(library, new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
      use_tmdb_similar: false,
    });
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Rec Only" }),
    ]);
    mockGetTmdbSimilar.mockResolvedValue([
      makeResult({ tmdb_id: 200, title: "Similar Only" }),
    ]);

    const result = await movieEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).toContain("Rec Only");
    expect(titles).not.toContain("Similar Only");
    expect(mockGetTmdbSimilar).not.toHaveBeenCalled();
  });

  it("respects movie_seed_min_rating — only seeds with sufficient rating", async () => {
    const library = [
      makeMovie({ id: 1, title: "High Rated", user_rating: 9, tmdb_id: 100 }),
      makeMovie({ id: 2, title: "Low Rated", user_rating: 5, tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
      movie_seed_min_rating: 8,
    });
    mockGetTmdbRecommendations
      .mockResolvedValueOnce([makeResult({ tmdb_id: 999, title: "From High" })])
      .mockResolvedValueOnce([makeResult({ tmdb_id: 888, title: "From Low" })]);

    await movieEngine(ctx);
    expect(mockGetTmdbRecommendations).toHaveBeenCalledTimes(1);
    expect(mockGetTmdbRecommendations).toHaveBeenCalledWith(100);
  });

  it("respects movie_seed_count — limits number of seeds", async () => {
    const library = Array.from({ length: 15 }, (_, i) =>
      makeMovie({ id: i + 1, title: `Film ${i}`, user_rating: 8, tmdb_id: (i + 1) * 10 }),
    );
    const ctx = buildContext(library, new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
      movie_seed_count: 3,
    });
    mockGetTmdbRecommendations.mockResolvedValue([]);

    await movieEngine(ctx);
    expect(mockGetTmdbRecommendations).toHaveBeenCalledTimes(3);
  });

  it("skips seed with rejected TMDb call", async () => {
    const library = [makeMovie({ id: 1, title: "Inception", user_rating: 9, tmdb_id: 27205 })];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockRejectedValue(new Error("network error"));

    const result = await movieEngine(ctx);
    expect(result).toEqual([]);
  });

  it("filters out library movies from recommendations", async () => {
    const library = [
      makeMovie({ id: 1, title: "Inception", user_rating: 9, tmdb_id: 27205 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 27205, title: "Inception" }), // already in library
      makeResult({ tmdb_id: 329865, title: "Arrival" }),
    ]);

    const result = await movieEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).not.toContain("Inception");
    expect(titles).toContain("Arrival");
  });
});

// ---------------------------------------------------------------------------
// actorEngine
// ---------------------------------------------------------------------------

describe("actorEngine", () => {
  it("returns empty when library has no rated movies", async () => {
    const ctx = buildContext([makeMovie({ id: 1, title: "Film" })], new Set());
    expect(await actorEngine(ctx)).toEqual([]);
  });

  it("generates actor-based groups from high-rated movies", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film A", user_rating: 9, tmdb_id: 100 }),
      makeMovie({ id: 2, title: "Film B", user_rating: 8, tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set());

    const actorId = 42;
    mockGetMovieCredits.mockResolvedValue({
      directors: [],
      cast: [{ id: actorId, name: "Tom Hanks" }],
    });
    mockDiscoverByPerson.mockResolvedValue([
      makeResult({ tmdb_id: 999, title: "Cast Away" }),
    ]);

    const result = await actorEngine(ctx);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].reason).toContain("Tom Hanks");
    expect(result[0].type).toBe("actor");
    expect(result[0].recommendations[0].trace).toMatchObject({
      engine: "actor",
      source: "live_tmdb",
      seedKind: "actor",
      seedId: actorId,
      seedName: "Tom Hanks",
    });
  });

  it("respects actor_min_appearances=1 — includes actors with single appearance", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", user_rating: 8, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
      actor_min_appearances: 1,
    });
    mockGetMovieCredits.mockResolvedValue({
      directors: [],
      cast: [{ id: 1, name: "Solo Actor" }],
    });
    mockDiscoverByPerson.mockResolvedValue([makeResult({ tmdb_id: 500, title: "New Film" })]);

    const result = await actorEngine(ctx);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].reason).toContain("Solo Actor");
  });

  it("applies default actor_min_appearances=2 — ignores actors appearing only once with low rating", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", user_rating: 7.5, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());

    mockGetMovieCredits.mockResolvedValue({
      directors: [],
      cast: [{ id: 1, name: "Rare Actor" }],
    });
    mockDiscoverByPerson.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Another Film" })]);

    const result = await actorEngine(ctx);
    expect(result).toEqual([]);
  });

  it("includes actor appearing once if avgRating >= 9", async () => {
    const library = [makeMovie({ id: 1, title: "Masterpiece", user_rating: 10, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());

    mockGetMovieCredits.mockResolvedValue({
      directors: [],
      cast: [{ id: 77, name: "Star Actor" }],
    });
    mockDiscoverByPerson.mockResolvedValue([makeResult({ tmdb_id: 600, title: "Star Film" })]);

    const result = await actorEngine(ctx);
    expect(result.some((g) => g.reason.includes("Star Actor"))).toBe(true);
  });

  it("skips failed credit fetches gracefully", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", user_rating: 9, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    mockGetMovieCredits.mockRejectedValue(new Error("TMDb down"));

    const result = await actorEngine(ctx);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// directorEngine
// ---------------------------------------------------------------------------

describe("directorEngine", () => {
  it("returns empty when library has no rated movies", async () => {
    const ctx = buildContext([makeMovie({ id: 1, title: "Film" })], new Set());
    expect(await directorEngine(ctx)).toEqual([]);
  });

  it("generates director-based groups from high-rated movies", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film A", user_rating: 9, tmdb_id: 100 }),
      makeMovie({ id: 2, title: "Film B", user_rating: 8, tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set());

    const dirId = 99;
    mockGetMovieCredits.mockResolvedValue({
      directors: [{ id: dirId, name: "Christopher Nolan" }],
      cast: [],
    });
    mockDiscoverByPerson.mockResolvedValue([
      makeResult({ tmdb_id: 888, title: "Tenet" }),
    ]);

    const result = await directorEngine(ctx);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].reason).toContain("Christopher Nolan");
    expect(result[0].type).toBe("director");
    expect(result[0].recommendations[0].trace).toMatchObject({
      engine: "director",
      source: "live_tmdb",
      seedKind: "director",
      seedId: dirId,
      seedName: "Christopher Nolan",
    });
  });

  it("respects director_min_films=1 — includes director with single film", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", user_rating: 7.5, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
      director_min_films: 1,
    });
    mockGetMovieCredits.mockResolvedValue({
      directors: [{ id: 55, name: "One Hit Director" }],
      cast: [],
    });
    mockDiscoverByPerson.mockResolvedValue([makeResult({ tmdb_id: 700, title: "New Film" })]);

    const result = await directorEngine(ctx);
    expect(result.some((g) => g.reason.includes("One Hit Director"))).toBe(true);
  });

  it("applies default director_min_films=2 — ignores director with one mid-rated film", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", user_rating: 7.5, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());

    mockGetMovieCredits.mockResolvedValue({
      directors: [{ id: 55, name: "One Film Director" }],
      cast: [],
    });
    mockDiscoverByPerson.mockResolvedValue([makeResult({ tmdb_id: 700, title: "Their Film" })]);

    const result = await directorEngine(ctx);
    expect(result).toEqual([]);
  });

  it("includes director with one film rated >= 9 (avgRating override)", async () => {
    const library = [makeMovie({ id: 1, title: "Masterpiece", user_rating: 10, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());

    mockGetMovieCredits.mockResolvedValue({
      directors: [{ id: 66, name: "Auteur" }],
      cast: [],
    });
    mockDiscoverByPerson.mockResolvedValue([makeResult({ tmdb_id: 800, title: "Next Film" })]);

    const result = await directorEngine(ctx);
    expect(result.some((g) => g.reason.includes("Auteur"))).toBe(true);
  });

  it("skips failed credit fetches gracefully", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", user_rating: 9, tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    mockGetMovieCredits.mockRejectedValue(new Error("network error"));

    const result = await directorEngine(ctx);
    expect(result).toEqual([]);
  });

  it("filters out library movies from discover results", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film A", user_rating: 9, tmdb_id: 100 }),
      makeMovie({ id: 2, title: "Film B", user_rating: 8, tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set());

    mockGetMovieCredits.mockResolvedValue({
      directors: [{ id: 10, name: "Great Director" }],
      cast: [],
    });
    mockDiscoverByPerson.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Film A" }), // already in library
      makeResult({ tmdb_id: 999, title: "New Film" }),
    ]);

    const result = await directorEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).not.toContain("Film A");
    expect(titles).toContain("New Film");
  });
});
