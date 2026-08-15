// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "@/lib/engines";
import type { Movie } from "@/lib/db";
import type { TmdbSearchResult } from "@/lib/tmdb";

const {
  mockDiscoverHiddenGems,
  mockDiscoverStarStudded,
  mockGetTmdbRecommendations,
  mockGenreNameToId,
} = vi.hoisted(() => ({
  mockDiscoverHiddenGems: vi.fn(),
  mockDiscoverStarStudded: vi.fn(),
  mockGetTmdbRecommendations: vi.fn(),
  mockGenreNameToId: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  discoverHiddenGems: mockDiscoverHiddenGems,
  discoverStarStudded: mockDiscoverStarStudded,
  getTmdbRecommendations: mockGetTmdbRecommendations,
  genreNameToId: mockGenreNameToId,
}));

import { hiddenGemEngine } from "@/lib/engines/hidden-gem";
import { starStuddedEngine } from "@/lib/engines/star-studded";
import { watchlistEngine } from "@/lib/engines/watchlist";

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
    rating: 6.5,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockDiscoverHiddenGems.mockResolvedValue([]);
  mockDiscoverStarStudded.mockResolvedValue([]);
  mockGetTmdbRecommendations.mockResolvedValue([]);
  mockGenreNameToId.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// hiddenGemEngine
// ---------------------------------------------------------------------------

describe("hiddenGemEngine", () => {
  it("returns empty when library is empty", async () => {
    const ctx = buildContext([], new Set());
    expect(await hiddenGemEngine(ctx)).toEqual([]);
  });

  it("returns empty when discoverHiddenGems yields no results", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverHiddenGems.mockResolvedValue([]);
    expect(await hiddenGemEngine(ctx)).toEqual([]);
  });

  it("returns a group with hidden_gem type", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverHiddenGems.mockResolvedValue([
      makeResult({ tmdb_id: 500, title: "Obscure Gem" }),
    ]);

    const result = await hiddenGemEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("hidden_gem");
    expect(result[0].recommendations[0].title).toBe("Obscure Gem");
  });

  it("includes top genre in reason when library has rated movies", async () => {
    const library = [
      makeMovie({ id: 1, title: "Drama A", genre: "Drama", user_rating: 9 }),
      makeMovie({ id: 2, title: "Drama B", genre: "Drama", user_rating: 8 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Gem" })]);

    const result = await hiddenGemEngine(ctx);
    expect(result[0].reason).toContain("Drama");
  });

  it("uses generic reason when library has no genres", async () => {
    const library = [makeMovie({ id: 1, title: "Film", genre: null as unknown as string })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(null);
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Gem" })]);

    const result = await hiddenGemEngine(ctx);
    expect(result[0].reason).toContain("Hidden gems");
  });

  it("passes genreId to discoverHiddenGems when top genre resolves", async () => {
    const library = [makeMovie({ id: 1, title: "Sci-Fi Film", genre: "Sci-Fi", user_rating: 9 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(878);
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Space Gem" })]);

    await hiddenGemEngine(ctx);
    expect(mockDiscoverHiddenGems).toHaveBeenCalledWith(878);
  });

  it("passes undefined to discoverHiddenGems when no top genre", async () => {
    const ctx = buildContext([], new Set());
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 1, title: "Gem" })]);

    await hiddenGemEngine(ctx);
    expect(mockDiscoverHiddenGems).toHaveBeenCalledWith(undefined);
  });

  it("filters out movies already in library", async () => {
    const library = [
      makeMovie({ id: 1, title: "Drama Film", genre: "Drama", tmdb_id: 100, user_rating: 8 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverHiddenGems.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Drama Film" }), // in library
      makeResult({ tmdb_id: 200, title: "New Gem" }),
    ]);

    const result = await hiddenGemEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Drama Film");
    expect(titles).toContain("New Gem");
  });

  it("filters out dismissed movies", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set([999]));
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverHiddenGems.mockResolvedValue([
      makeResult({ tmdb_id: 999, title: "Dismissed Gem" }),
      makeResult({ tmdb_id: 888, title: "Visible Gem" }),
    ]);

    const result = await hiddenGemEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed Gem");
    expect(titles).toContain("Visible Gem");
  });

  it("skips movies with user_rating < 5 when calculating top genre", async () => {
    const library = [
      makeMovie({ id: 1, title: "Bad Drama", genre: "Drama", user_rating: 3 }),
      makeMovie({ id: 2, title: "Good Thriller", genre: "Thriller", user_rating: 9 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockImplementation((g: string) => (g === "Thriller" ? 53 : 18));
    mockDiscoverHiddenGems.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Thriller Gem" })]);

    const result = await hiddenGemEngine(ctx);
    // Thriller should win (Drama is skipped due to low rating)
    expect(result[0].reason).toContain("Thriller");
    expect(mockDiscoverHiddenGems).toHaveBeenCalledWith(53);
  });

  it("limits results to 15", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverHiddenGems.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => makeResult({ tmdb_id: i + 1, title: `Gem ${i}` })),
    );

    const result = await hiddenGemEngine(ctx);
    expect(result[0].recommendations).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// starStuddedEngine
// ---------------------------------------------------------------------------

describe("starStuddedEngine", () => {
  it("returns empty when discoverStarStudded yields no results", async () => {
    const ctx = buildContext([], new Set());
    expect(await starStuddedEngine(ctx)).toEqual([]);
  });

  it("returns a group with star_studded type", async () => {
    const ctx = buildContext([], new Set());
    mockDiscoverStarStudded.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Blockbuster" }),
    ]);

    const result = await starStuddedEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("star_studded");
    expect(result[0].reason).toContain("Star-studded");
  });

  it("returns empty when all results are in library", async () => {
    const library = [makeMovie({ id: 1, title: "Blockbuster", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    mockDiscoverStarStudded.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Blockbuster" }),
    ]);

    expect(await starStuddedEngine(ctx)).toEqual([]);
  });

  it("filters out library movies", async () => {
    const library = [makeMovie({ id: 1, title: "Existing", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    mockDiscoverStarStudded.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Existing" }),
      makeResult({ tmdb_id: 200, title: "New Blockbuster" }),
    ]);

    const result = await starStuddedEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Existing");
    expect(titles).toContain("New Blockbuster");
  });

  it("filters out dismissed movies", async () => {
    const ctx = buildContext([], new Set([300]));
    mockDiscoverStarStudded.mockResolvedValue([
      makeResult({ tmdb_id: 300, title: "Dismissed" }),
      makeResult({ tmdb_id: 400, title: "Visible" }),
    ]);

    const result = await starStuddedEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Visible");
  });

  it("limits results to 15", async () => {
    const ctx = buildContext([], new Set());
    mockDiscoverStarStudded.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => makeResult({ tmdb_id: i + 1, title: `Film ${i}` })),
    );

    const result = await starStuddedEngine(ctx);
    expect(result[0].recommendations).toHaveLength(15);
  });

  it("calls discoverStarStudded with no arguments", async () => {
    const ctx = buildContext([], new Set());
    mockDiscoverStarStudded.mockResolvedValue([makeResult({ tmdb_id: 1, title: "Film" })]);

    await starStuddedEngine(ctx);
    expect(mockDiscoverStarStudded).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// watchlistEngine
// ---------------------------------------------------------------------------

describe("watchlistEngine", () => {
  it("returns empty when library has no wishlist movies", async () => {
    const library = [makeMovie({ id: 1, title: "Film", wishlist: 0 })];
    const ctx = buildContext(library, new Set());
    expect(await watchlistEngine(ctx)).toEqual([]);
  });

  it("returns empty when library is empty", async () => {
    const ctx = buildContext([], new Set());
    expect(await watchlistEngine(ctx)).toEqual([]);
  });

  it("returns empty when wishlist movies have no tmdb_id", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film", wishlist: 1, tmdb_id: null as unknown as number }),
    ];
    const ctx = buildContext(library, new Set());
    expect(await watchlistEngine(ctx)).toEqual([]);
  });

  it("returns groups for each wishlist movie with recommendations", async () => {
    const library = [
      makeMovie({ id: 1, title: "Want To Watch", tmdb_id: 100, wishlist: 1 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 500, title: "You Might Like" }),
    ]);

    const result = await watchlistEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("watchlist");
    expect(result[0].reason).toContain("Want To Watch");
    expect(result[0].recommendations[0].title).toBe("You Might Like");
  });

  it("skips wishlist movie when getTmdbRecommendations rejects", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film A", tmdb_id: 100, wishlist: 1 }),
      makeMovie({ id: 2, title: "Film B", tmdb_id: 200, wishlist: 1 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations
      .mockRejectedValueOnce(new Error("TMDb down"))
      .mockResolvedValueOnce([makeResult({ tmdb_id: 500, title: "From Film B" })]);

    const result = await watchlistEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("Film B");
  });

  it("skips wishlist movie when recommendations yield no new movies", async () => {
    const library = [makeMovie({ id: 1, title: "Film", tmdb_id: 100, wishlist: 1 })];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([]);

    expect(await watchlistEngine(ctx)).toEqual([]);
  });

  it("filters out library movies from recommendations", async () => {
    const library = [
      makeMovie({ id: 1, title: "Wishlist Film", tmdb_id: 100, wishlist: 1 }),
      makeMovie({ id: 2, title: "Already Have", tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 200, title: "Already Have" }), // in library
      makeResult({ tmdb_id: 300, title: "New Pick" }),
    ]);

    const result = await watchlistEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Already Have");
    expect(titles).toContain("New Pick");
  });

  it("filters out dismissed movies from recommendations", async () => {
    const library = [makeMovie({ id: 1, title: "Wishlist Film", tmdb_id: 100, wishlist: 1 })];
    const ctx = buildContext(library, new Set([400]));
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 400, title: "Dismissed" }),
      makeResult({ tmdb_id: 500, title: "Visible" }),
    ]);

    const result = await watchlistEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Visible");
  });

  it("limits seeds to first 8 wishlist movies", async () => {
    const library = Array.from({ length: 12 }, (_, i) =>
      makeMovie({ id: i + 1, title: `Wishlist ${i}`, tmdb_id: (i + 1) * 10, wishlist: 1 }),
    );
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations.mockResolvedValue([
      makeResult({ tmdb_id: 999, title: "Rec" }),
    ]);

    await watchlistEngine(ctx);
    expect(mockGetTmdbRecommendations).toHaveBeenCalledTimes(8);
  });

  it("generates a group per wishlist seed that returns results", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film A", tmdb_id: 100, wishlist: 1 }),
      makeMovie({ id: 2, title: "Film B", tmdb_id: 200, wishlist: 1 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGetTmdbRecommendations
      .mockResolvedValueOnce([makeResult({ tmdb_id: 500, title: "Rec A" })])
      .mockResolvedValueOnce([makeResult({ tmdb_id: 600, title: "Rec B" })]);

    const result = await watchlistEngine(ctx);
    expect(result).toHaveLength(2);
    expect(result[0].reason).toContain("Film A");
    expect(result[1].reason).toContain("Film B");
  });
});
