// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "@/lib/engines";
import type { Movie } from "@/lib/db";
import type { TmdbSearchResult } from "@/lib/tmdb";
import type { RecommendedMovie } from "@/lib/db";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockGetDb,
  mockGetRecommendedMovies,
  mockGetDismissedIds,
  mockGetImpressionCounts,
  mockDiscoverHiddenGems,
  mockDiscoverStarStudded,
  mockGetTmdbRecommendations,
  mockGenreNameToId,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetRecommendedMovies: vi.fn(),
  mockGetDismissedIds: vi.fn(),
  mockGetImpressionCounts: vi.fn(),
  mockDiscoverHiddenGems: vi.fn(),
  mockDiscoverStarStudded: vi.fn(),
  mockGetTmdbRecommendations: vi.fn(),
  mockGenreNameToId: vi.fn(),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDb: mockGetDb,
    getRecommendedMovies: mockGetRecommendedMovies,
    getDismissedIds: mockGetDismissedIds,
    getImpressionCounts: mockGetImpressionCounts,
  };
});

vi.mock("@/lib/tmdb", () => ({
  discoverHiddenGems: mockDiscoverHiddenGems,
  discoverStarStudded: mockDiscoverStarStudded,
  getTmdbRecommendations: mockGetTmdbRecommendations,
  genreNameToId: mockGenreNameToId,
}));

import { hiddenGemEngine } from "@/lib/engines/hidden-gem";
import { starStuddedEngine } from "@/lib/engines/star-studded";
import { watchlistEngine } from "@/lib/engines/watchlist";
import { cdaEngine } from "@/lib/engines/cda";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    rating: 7.0,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

function makeRecommendedMovie(overrides: Partial<RecommendedMovie> & { tmdb_id: number; title: string }): RecommendedMovie {
  const { trace, ...rest } = overrides;
  return {
    id: 1,
    engine: "cda",
    reason: "cda",
    year: 2020,
    genre: "Drama",
    rating: 7.0,
    poster_url: null,
    pl_title: null,
    cda_url: "https://cda.pl/video/test",
    description: null,
    cda_last_status: null,
    cda_last_checked_at: null,
    created_at: "2026-01-01",
    ...rest,
    trace: trace ?? null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetDb.mockReturnValue({});
  mockGetRecommendedMovies.mockReturnValue([]);
  mockGetDismissedIds.mockReturnValue(new Set());
  mockDiscoverHiddenGems.mockResolvedValue([]);
  mockDiscoverStarStudded.mockResolvedValue([]);
  mockGetTmdbRecommendations.mockResolvedValue([]);
  mockGenreNameToId.mockReturnValue(null);
  mockGetImpressionCounts.mockReturnValue(new Map());
});

// ---------------------------------------------------------------------------
// hiddenGemEngine
// ---------------------------------------------------------------------------

describe("hiddenGemEngine", () => {
  it("returns empty when no hidden gems discovered", async () => {
    const ctx = buildContext([makeMovie({ id: 1, title: "Film", user_rating: 8 })], new Set());
    expect(await hiddenGemEngine(ctx)).toEqual([]);
  });

  it("returns empty when all discovered gems are in library", async () => {
    const library = [makeMovie({ id: 1, title: "Gem", tmdb_id: 999, user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 999, title: "Gem" })]);

    expect(await hiddenGemEngine(ctx)).toEqual([]);
  });

  it("returns a group with hidden gems filtered from library", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 9 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverHiddenGems.mockResolvedValue([
      makeResult({ tmdb_id: 500, title: "Hidden Gem" }),
    ]);

    const result = await hiddenGemEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("hidden_gem");
    expect(result[0].recommendations[0].title).toBe("Hidden Gem");
  });

  it("uses top genre from library to pick genre for gem discovery", async () => {
    const library = [
      makeMovie({ id: 1, title: "Sci-Fi A", genre: "Sci-Fi", user_rating: 9 }),
      makeMovie({ id: 2, title: "Sci-Fi B", genre: "Sci-Fi", user_rating: 8 }),
      makeMovie({ id: 3, title: "Drama A", genre: "Drama", user_rating: 7 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockImplementation((g: string) => (g === "Sci-Fi" ? 878 : 18));
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 600, title: "Sci-Fi Gem" })]);

    const result = await hiddenGemEngine(ctx);
    expect(mockDiscoverHiddenGems).toHaveBeenCalledWith(878);
    expect(result[0].reason).toContain("Sci-Fi");
  });

  it("uses generic reason when library is empty", async () => {
    const ctx = buildContext([], new Set());
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 700, title: "Random Gem" })]);

    const result = await hiddenGemEngine(ctx);
    expect(result[0].reason).toContain("Hidden gems");
    expect(mockDiscoverHiddenGems).toHaveBeenCalledWith(undefined);
  });

  it("limits recommendations to 15", async () => {
    const ctx = buildContext([], new Set());
    const gems = Array.from({ length: 20 }, (_, i) =>
      makeResult({ tmdb_id: i + 1, title: `Gem ${i}` }),
    );
    mockDiscoverHiddenGems.mockResolvedValue(gems);

    const result = await hiddenGemEngine(ctx);
    expect(result[0].recommendations).toHaveLength(15);
  });

  it("ignores movies with low user_rating (<5) when building genre scores", async () => {
    const library = [
      makeMovie({ id: 1, title: "Bad Drama", genre: "Drama", user_rating: 3 }),
      makeMovie({ id: 2, title: "Good Sci-Fi", genre: "Sci-Fi", user_rating: 8 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockImplementation((g: string) => (g === "Sci-Fi" ? 878 : 18));
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 800, title: "Found" })]);

    await hiddenGemEngine(ctx);
    // Sci-Fi has weight, Drama has none (user_rating < 5)
    expect(mockDiscoverHiddenGems).toHaveBeenCalledWith(878);
  });
});

// ---------------------------------------------------------------------------
// starStuddedEngine
// ---------------------------------------------------------------------------

describe("starStuddedEngine", () => {
  it("returns empty when no results discovered", async () => {
    const ctx = buildContext([], new Set());
    expect(await starStuddedEngine(ctx)).toEqual([]);
  });

  it("returns empty when all discovered films are in library", async () => {
    const library = [makeMovie({ id: 1, title: "Blockbuster", tmdb_id: 500 })];
    const ctx = buildContext(library, new Set());
    mockDiscoverStarStudded.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Blockbuster" })]);

    expect(await starStuddedEngine(ctx)).toEqual([]);
  });

  it("returns a star-studded group with filtered results", async () => {
    const ctx = buildContext([], new Set());
    mockDiscoverStarStudded.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Avengers" }),
      makeResult({ tmdb_id: 200, title: "Top Gun" }),
    ]);

    const result = await starStuddedEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("star_studded");
    expect(result[0].reason).toContain("blockbusters");
    expect(result[0].recommendations).toHaveLength(2);
  });

  it("limits recommendations to 15", async () => {
    const ctx = buildContext([], new Set());
    mockDiscoverStarStudded.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => makeResult({ tmdb_id: i + 1, title: `Film ${i}` })),
    );

    const result = await starStuddedEngine(ctx);
    expect(result[0].recommendations).toHaveLength(15);
  });

  it("filters dismissed movies", async () => {
    const ctx = buildContext([], new Set([100]));
    mockDiscoverStarStudded.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Dismissed" }),
      makeResult({ tmdb_id: 200, title: "Visible" }),
    ]);

    const result = await starStuddedEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Visible");
  });
});

// ---------------------------------------------------------------------------
// watchlistEngine
// ---------------------------------------------------------------------------

describe("watchlistEngine", () => {
  it("returns empty when library has no wishlist items", async () => {
    const library = [makeMovie({ id: 1, title: "Film", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    expect(await watchlistEngine(ctx)).toEqual([]);
  });

  it("returns empty when wishlist items have no tmdb_id", async () => {
    const library = [makeMovie({ id: 1, title: "Film", tmdb_id: undefined as unknown as number, wishlist: 1 })];
    const ctx = buildContext(library, new Set());
    expect(await watchlistEngine(ctx)).toEqual([]);
  });

  it("generates groups from wishlist items", async () => {
    const library = [
      makeMovie({ id: 1, title: "Wanted Film", tmdb_id: 100, wishlist: 1 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 999, title: "Similar Film" }),
    ]);

    const result = await watchlistEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("watchlist");
    expect(result[0].reason).toContain("Wanted Film");
    expect(result[0].recommendations[0].title).toBe("Similar Film");
  });

  it("filters out library movies from watchlist recommendations", async () => {
    const library = [
      makeMovie({ id: 1, title: "Wanted", tmdb_id: 100, wishlist: 1 }),
      makeMovie({ id: 2, title: "Owned", tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 200, title: "Owned" }), // already in library
      makeResult({ tmdb_id: 300, title: "New Film" }),
    ]);

    const result = await watchlistEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).not.toContain("Owned");
    expect(titles).toContain("New Film");
  });

  it("skips wishlist seeds where TMDb call fails", async () => {
    const library = [
      makeMovie({ id: 1, title: "Wanted", tmdb_id: 100, wishlist: 1 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockRejectedValue(new Error("TMDb error"));

    const result = await watchlistEngine(ctx);
    expect(result).toEqual([]);
  });

  it("limits wishlist seeds to 8 items", async () => {
    const library = Array.from({ length: 12 }, (_, i) =>
      makeMovie({ id: i + 1, title: `Wish ${i}`, tmdb_id: (i + 1) * 10, wishlist: 1 }),
    );
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([]);

    await watchlistEngine(ctx);
    expect(mockGetTmdbRecommendations).toHaveBeenCalledTimes(8);
  });

  it("skips wishlist seed when filtered result is empty", async () => {
    const library = [
      makeMovie({ id: 1, title: "Wanted", tmdb_id: 100, wishlist: 1 }),
    ];
    const ctx = buildContext(library, new Set());
    // All recommendations already in library
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Wanted" }), // same as seed
    ]);

    const result = await watchlistEngine(ctx);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cdaEngine
// ---------------------------------------------------------------------------

describe("cdaEngine", () => {
  it("returns empty when no CDA movies in DB", async () => {
    mockGetRecommendedMovies.mockReturnValue([]);
    mockGetDismissedIds.mockReturnValue(new Set());
    const ctx = buildContext([], new Set());
    expect(await cdaEngine(ctx)).toEqual([]);
  });

  it("returns groups sorted by genre preference", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "Drama Film", genre: "Drama" }),
      makeRecommendedMovie({ tmdb_id: 2, title: "Action Film", genre: "Action" }),
    ]);

    const library = [
      makeMovie({ id: 10, title: "My Drama", genre: "Drama", user_rating: 9 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // Drama has preference, so it should come first
    expect(result[0].reason).toContain("Drama");
  });

  it("filters out dismissed movies from CDA results", async () => {
    mockGetDismissedIds.mockReturnValue(new Set([1]));
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "Dismissed Film", genre: "Drama" }),
      makeRecommendedMovie({ tmdb_id: 2, title: "Visible Film", genre: "Drama" }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).not.toContain("Dismissed Film");
    expect(titles).toContain("Visible Film");
  });

  it("filters out movies already in library by tmdb_id", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 100, title: "Library Film", genre: "Drama" }),
      makeRecommendedMovie({ tmdb_id: 200, title: "New Film", genre: "Drama" }),
    ]);

    const library = [makeMovie({ id: 1, title: "Library Film", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).not.toContain("Library Film");
    expect(titles).toContain("New Film");
  });

  it("filters out movies already in library by title", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 999, title: "My Owned Film", genre: "Drama" }),
    ]);

    const library = [makeMovie({ id: 1, title: "My Owned Film", tmdb_id: null as unknown as number })];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);
    expect(result.flatMap((g) => g.recommendations)).toHaveLength(0);
  });

  it("filters out movies by pl_title match", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 999, title: "Polish Title", pl_title: "Incepcja", genre: "Drama" }),
    ]);

    const library = [makeMovie({ id: 1, title: "Incepcja", tmdb_id: null as unknown as number })];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);
    expect(result.flatMap((g) => g.recommendations)).toHaveLength(0);
  });

  it("sorts movies within genre group by rating descending", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "Low Rated", genre: "Drama", rating: 5.0 }),
      makeRecommendedMovie({ tmdb_id: 2, title: "High Rated", genre: "Drama", rating: 9.0 }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);
    expect(result[0].recommendations[0].title).toBe("High Rated");
  });

  it("uses 'Other' genre for movies with no genre", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "No Genre Film", genre: null }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);
    expect(result[0].reason).toContain("Other");
  });

  it("sets cda type on returned groups", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "CDA Film", genre: "Drama" }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);
    expect(result[0].type).toBe("cda");
  });

  it("sorts genres alphabetically when preference scores are equal", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "Zombie Film", genre: "Horror" }),
      makeRecommendedMovie({ tmdb_id: 2, title: "Action Film", genre: "Action" }),
    ]);

    // Empty library → all genre scores are 0 → alphabetical fallback
    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);
    const genreNames = result.map((g) => g.reason.replace(" on CDA", ""));
    expect(genreNames).toEqual([...genreNames].sort());
  });

  it("ignores low-rated library movies (user_rating < 5) when building genre scores", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "Horror Film", genre: "Horror" }),
      makeRecommendedMovie({ tmdb_id: 2, title: "Drama Film", genre: "Drama" }),
    ]);

    // Drama is disliked (user_rating < 5); Horror is liked
    const library = [
      makeMovie({ id: 1, title: "Good Horror", genre: "Horror", user_rating: 8 }),
      makeMovie({ id: 2, title: "Bad Drama", genre: "Drama", user_rating: 2 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);
    // Horror should come first because Drama's low rating is excluded from scoring
    expect(result[0].reason).toContain("Horror");
  });

  it("treats user_rating=null as weight 5 (unrated contributes to genre score)", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "Sci-Fi Pick", genre: "Sci-Fi" }),
    ]);

    // Movie with no rating: user_rating=null → weight defaults to 5 via ??
    const library = [
      makeMovie({ id: 1, title: "Unrated Sci-Fi", genre: "Sci-Fi", user_rating: null }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);
    // Genre score should be 5 (>=5), so Sci-Fi group should appear
    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("Sci-Fi");
  });

  it("treats user_rating=0 as weight 0 (excluded from genre score, unlike null)", async () => {
    mockGetDismissedIds.mockReturnValue(new Set());
    mockGetRecommendedMovies.mockReturnValue([
      makeRecommendedMovie({ tmdb_id: 1, title: "Drama Pick", genre: "Drama" }),
      makeRecommendedMovie({ tmdb_id: 2, title: "Comedy Pick", genre: "Comedy" }),
    ]);

    // user_rating=0 → weight 0 via ?? (0 is not null/undefined) → filtered out (< 5)
    // user_rating=8 → weight 8 → contributes
    const library = [
      makeMovie({ id: 10, title: "Zero-rated Drama", genre: "Drama", user_rating: 0 }),
      makeMovie({ id: 11, title: "Liked Comedy", genre: "Comedy", user_rating: 8 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);
    // Drama gets no score (weight 0 < 5), Comedy gets score 8
    // So Comedy should appear first (or Drama might not appear at all if equal 0)
    const reasons = result.map((g) => g.reason);
    const comedyIdx = reasons.findIndex((r) => r.includes("Comedy"));
    const dramaIdx = reasons.findIndex((r) => r.includes("Drama"));
    // Comedy (score 8) must rank ahead of Drama (score 0)
    expect(comedyIdx).toBeGreaterThanOrEqual(0);
    if (dramaIdx >= 0) {
      expect(comedyIdx).toBeLessThan(dramaIdx);
    }
  });
});
