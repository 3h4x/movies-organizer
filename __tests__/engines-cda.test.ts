// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "@/lib/engines";
import type { Movie } from "@/lib/db";

// Hoisted mocks
const { mockGetDb, mockGetRecommendedMovies, mockGetDismissedIds } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetRecommendedMovies: vi.fn(),
  mockGetDismissedIds: vi.fn(),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDb: mockGetDb,
    getRecommendedMovies: mockGetRecommendedMovies,
    getDismissedIds: mockGetDismissedIds,
  };
});

import { cdaEngine } from "@/lib/engines/cda";

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

type RecommendedRow = {
  id: number;
  tmdb_id: number;
  engine: string;
  reason: string;
  title: string;
  year: number | null;
  genre: string | null;
  rating: number | null;
  poster_url: string | null;
  pl_title: string | null;
  cda_url: string | null;
  description: string | null;
  cda_last_status: number | null;
  created_at: string;
};

function makeRec(overrides: Partial<RecommendedRow> & { tmdb_id: number; title: string }): RecommendedRow {
  return {
    id: overrides.tmdb_id,
    engine: "cda",
    reason: "CDA",
    year: 2020,
    genre: "Drama",
    rating: 7.0,
    poster_url: null,
    pl_title: null,
    cda_url: "https://cda.pl/video/test",
    description: null,
    cda_last_status: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetDb.mockReturnValue({});
  mockGetDismissedIds.mockReturnValue(new Set<number>());
});

describe("cdaEngine", () => {
  it("returns empty array when no CDA movies exist", async () => {
    mockGetRecommendedMovies.mockReturnValue([]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);

    expect(result).toEqual([]);
  });

  it("groups movies by primary genre with CDA reason label", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Sci-Fi Film", genre: "Science Fiction, Action" }),
      makeRec({ tmdb_id: 2, title: "Drama Film", genre: "Drama" }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);

    const types = result.map((g) => g.reason);
    expect(types).toContain("Science Fiction on CDA");
    expect(types).toContain("Drama on CDA");
    expect(result[0].recommendations[0].trace).toMatchObject({
      engine: "cda",
      source: "recommended_movies",
      seedKind: "cda",
    });
  });

  it("filters out movies already in library by tmdb_id", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 100, title: "In Library" }),
      makeRec({ tmdb_id: 200, title: "Not In Library" }),
    ]);

    // Put a movie with tmdb_id=100 in the library so ctx.libraryTmdbIds contains it
    const library = [makeMovie({ id: 1, title: "Library Movie", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);

    const allRecs = result.flatMap((g) => g.recommendations);
    expect(allRecs.find((r) => r.tmdb_id === 100)).toBeUndefined();
    expect(allRecs.find((r) => r.tmdb_id === 200)).toBeDefined();
  });

  it("filters out movies already in library by title", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Inception" }),
      makeRec({ tmdb_id: 2, title: "The Matrix" }),
    ]);

    // Put "Inception" in the library so ctx.libraryTitles contains it
    const library = [makeMovie({ id: 99, title: "Inception", tmdb_id: 9999 })];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);

    const allRecs = result.flatMap((g) => g.recommendations);
    expect(allRecs.find((r) => r.title === "Inception")).toBeUndefined();
    expect(allRecs.find((r) => r.title === "The Matrix")).toBeDefined();
  });

  it("excludes links marked dead (404/410) but keeps live and unchecked ones", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Dead 404", cda_last_status: 404 }),
      makeRec({ tmdb_id: 2, title: "Dead 410", cda_last_status: 410 }),
      makeRec({ tmdb_id: 3, title: "Live 200", cda_last_status: 200 }),
      makeRec({ tmdb_id: 4, title: "Unchecked", cda_last_status: null }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);

    const allRecs = result.flatMap((g) => g.recommendations);
    expect(allRecs.find((r) => r.tmdb_id === 1)).toBeUndefined();
    expect(allRecs.find((r) => r.tmdb_id === 2)).toBeUndefined();
    expect(allRecs.find((r) => r.tmdb_id === 3)).toBeDefined();
    expect(allRecs.find((r) => r.tmdb_id === 4)).toBeDefined();
  });

  it("filters out dismissed movies", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Dismissed Film" }),
      makeRec({ tmdb_id: 2, title: "Active Film" }),
    ]);
    mockGetDismissedIds.mockReturnValue(new Set([1]));

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);

    const allRecs = result.flatMap((g) => g.recommendations);
    expect(allRecs.find((r) => r.tmdb_id === 1)).toBeUndefined();
    expect(allRecs.find((r) => r.tmdb_id === 2)).toBeDefined();
  });

  it("sorts genres by user preference (weighted by user_rating)", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 9001, title: "Sci-Fi Rec", genre: "Science Fiction" }),
      makeRec({ tmdb_id: 9002, title: "Drama Rec", genre: "Drama" }),
    ]);

    // User has 3 highly-rated Sci-Fi movies → Sci-Fi should rank first
    const library = [
      makeMovie({ id: 10, title: "Film A", genre: "Science Fiction", user_rating: 9 }),
      makeMovie({ id: 11, title: "Film B", genre: "Science Fiction", user_rating: 8 }),
      makeMovie({ id: 12, title: "Film C", genre: "Science Fiction", user_rating: 7 }),
      makeMovie({ id: 13, title: "Film D", genre: "Drama", user_rating: 6 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);

    expect(result[0].reason).toBe("Science Fiction on CDA");
    expect(result[1].reason).toBe("Drama on CDA");
  });

  it("assigns 'Other' genre when movie has no genre set", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Mystery Film", genre: null }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("Other on CDA");
  });

  it("filters by pl_title match against library titles", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Parasite", pl_title: "Pasożyt" }),
      makeRec({ tmdb_id: 2, title: "The Others" }),
    ]);

    // Library has a movie titled "Pasożyt" → pl_title match should filter it out
    const library = [makeMovie({ id: 99, title: "Pasożyt", tmdb_id: 9999 })];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);

    const allRecs = result.flatMap((g) => g.recommendations);
    expect(allRecs.find((r) => r.tmdb_id === 1)).toBeUndefined();
    expect(allRecs.find((r) => r.tmdb_id === 2)).toBeDefined();
  });

  it("sorts recommendations within a genre group by rating descending", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Low Rated", genre: "Action", rating: 5.5 }),
      makeRec({ tmdb_id: 2, title: "High Rated", genre: "Action", rating: 9.0 }),
      makeRec({ tmdb_id: 3, title: "Mid Rated", genre: "Action", rating: 7.0 }),
    ]);

    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);

    expect(result).toHaveLength(1);
    const recs = result[0].recommendations;
    expect(recs[0].tmdb_id).toBe(2); // 9.0
    expect(recs[1].tmdb_id).toBe(3); // 7.0
    expect(recs[2].tmdb_id).toBe(1); // 5.5
  });

  it("sorts genres alphabetically when preference scores are tied", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Thriller Rec", genre: "Thriller" }),
      makeRec({ tmdb_id: 2, title: "Action Rec", genre: "Action" }),
      makeRec({ tmdb_id: 3, title: "Comedy Rec", genre: "Comedy" }),
    ]);

    // Empty library → all genre scores = 0 → alphabetical fallback
    const ctx = buildContext([], new Set());
    const result = await cdaEngine(ctx);

    expect(result).toHaveLength(3);
    expect(result[0].reason).toBe("Action on CDA");
    expect(result[1].reason).toBe("Comedy on CDA");
    expect(result[2].reason).toBe("Thriller on CDA");
  });

  it("skips library movies with user_rating < 5 when building genre preference scores", async () => {
    mockGetRecommendedMovies.mockReturnValue([
      makeRec({ tmdb_id: 1, title: "Sci-Fi Rec", genre: "Sci-Fi" }),
      makeRec({ tmdb_id: 2, title: "Drama Rec", genre: "Drama" }),
    ]);

    // User dislikes Sci-Fi (rating < 5) and likes Drama — Sci-Fi should not score higher
    const library = [
      makeMovie({ id: 1, title: "Disliked Sci-Fi", genre: "Sci-Fi", user_rating: 2 }),
      makeMovie({ id: 2, title: "Liked Drama", genre: "Drama", user_rating: 8 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await cdaEngine(ctx);

    expect(result).toHaveLength(2);
    expect(result[0].reason).toBe("Drama on CDA");
  });
});
