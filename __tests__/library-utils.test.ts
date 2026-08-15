// tamtam inspected 2026-05-21
import { describe, it, expect } from "vitest";
import {
  filterMovies,
  parseGenreLabels,
  sortMovies,
  extractGenres,
  extractSources,
  extractYears,
  getRatedMovieTmdbIds,
  filterRatedRecommendations,
  deduplicateRecommendations,
} from "@/lib/utils";
import type { Movie } from "@/lib/types";
import type { RecommendationGroup } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    title: "Test Movie",
    year: 2020,
    genre: "Drama",
    director: null,
    writer: null,
    actors: null,
    rating: 7.0,
    user_rating: null,
    poster_url: null,
    source: "manual",
    type: "movie",
    tmdb_id: null,
    rated_at: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeRec(tmdb_id: number, overrides: Partial<TmdbSearchResult> = {}): TmdbSearchResult {
  return {
    tmdb_id,
    title: `Movie ${tmdb_id}`,
    year: 2020,
    genre: "Drama",
    rating: 7.0,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

function makeGroup(reason: string, recs: TmdbSearchResult[]): RecommendationGroup {
  return { reason, type: "genre", recommendations: recs };
}

// ---------------------------------------------------------------------------
// parseGenreLabels
// ---------------------------------------------------------------------------
describe("parseGenreLabels", () => {
  it("deduplicates labels after Polish aliases are normalized", () => {
    expect(parseGenreLabels("Dramat, Drama, Kryminał, Crime")).toEqual([
      "Drama",
      "Crime",
    ]);
  });
});

// ---------------------------------------------------------------------------
// filterMovies
// ---------------------------------------------------------------------------
describe("filterMovies", () => {
  it("excludes unrated recommendations from library view", () => {
    const movies = [
      makeMovie({ id: 1, source: "manual" }),
      makeMovie({ id: 2, source: "recommendation", user_rating: null }),
      makeMovie({ id: 3, source: "recommendation", user_rating: 8 }),
    ];
    const result = filterMovies(movies, {});
    expect(result.map((m) => m.id)).toEqual([1, 3]);
  });

  it("filters by search query on title", () => {
    const movies = [
      makeMovie({ id: 1, title: "Inception" }),
      makeMovie({ id: 2, title: "Interstellar" }),
    ];
    const result = filterMovies(movies, { searchQuery: "inception" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filters by search query on pl_title", () => {
    const movies = [
      makeMovie({ id: 1, title: "Inception", pl_title: "Incepcja" }),
      makeMovie({ id: 2, title: "Interstellar", pl_title: null }),
    ];
    const result = filterMovies(movies, { searchQuery: "incepcja" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("search query is case-insensitive", () => {
    const movies = [makeMovie({ title: "INCEPTION" })];
    expect(filterMovies(movies, { searchQuery: "inception" })).toHaveLength(1);
    expect(filterMovies(movies, { searchQuery: "INCEPTION" })).toHaveLength(1);
    expect(filterMovies(movies, { searchQuery: "Inc" })).toHaveLength(1);
  });

  it("filters by genre", () => {
    const movies = [
      makeMovie({ id: 1, genre: "Drama, Thriller" }),
      makeMovie({ id: 2, genre: "Comedy" }),
    ];
    const result = filterMovies(movies, { genreFilter: "Drama" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filters by normalized genre labels across Polish and English sources", () => {
    const movies = [
      makeMovie({ id: 1, genre: "Dramat,Thriller" }),
      makeMovie({ id: 2, genre: "Drama , Crime" }),
      makeMovie({ id: 3, genre: "Comedy" }),
    ];

    const result = filterMovies(movies, { genreFilter: "Drama" });

    expect(result.map((movie) => movie.id)).toEqual([1, 2]);
  });

  it("filters by source", () => {
    const movies = [
      makeMovie({ id: 1, source: "tmdb" }),
      makeMovie({ id: 2, source: "manual" }),
    ];
    const result = filterMovies(movies, { sourceFilter: "tmdb" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filters by year as string", () => {
    const movies = [
      makeMovie({ id: 1, year: 2010 }),
      makeMovie({ id: 2, year: 2020 }),
    ];
    const result = filterMovies(movies, { yearFilter: "2010" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filters unrated only", () => {
    const movies = [
      makeMovie({ id: 1, user_rating: null }),
      makeMovie({ id: 2, user_rating: 0 }),
      makeMovie({ id: 3, user_rating: 7 }),
    ];
    const result = filterMovies(movies, { unratedOnly: true });
    expect(result.map((m) => m.id)).toEqual([1, 2]);
  });

  it("filters hasFileOnly — keeps movies with a file_path, excludes null/undefined", () => {
    const movies = [
      makeMovie({ id: 1, file_path: "/movies/inception.mkv" }),
      makeMovie({ id: 2, file_path: null }),
      makeMovie({ id: 3, file_path: undefined }),
    ];
    const result = filterMovies(movies, { hasFileOnly: true });
    expect(result.map((m) => m.id)).toEqual([1]);
  });

  it("hasFileOnly does not filter when false", () => {
    const movies = [
      makeMovie({ id: 1, file_path: "/movies/inception.mkv" }),
      makeMovie({ id: 2, file_path: null }),
    ];
    const result = filterMovies(movies, { hasFileOnly: false });
    expect(result.map((m) => m.id)).toEqual([1, 2]);
  });

  it("applies multiple filters simultaneously", () => {
    const movies = [
      makeMovie({ id: 1, genre: "Drama", year: 2010, user_rating: null }),
      makeMovie({ id: 2, genre: "Drama", year: 2020, user_rating: null }),
      makeMovie({ id: 3, genre: "Comedy", year: 2010, user_rating: null }),
    ];
    const result = filterMovies(movies, {
      genreFilter: "Drama",
      yearFilter: "2010",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("returns all movies when no filters applied", () => {
    const movies = [makeMovie({ id: 1 }), makeMovie({ id: 2 })];
    expect(filterMovies(movies, {})).toHaveLength(2);
  });

  it("returns empty array for no matches", () => {
    const movies = [makeMovie({ genre: "Drama" })];
    expect(filterMovies(movies, { genreFilter: "Horror" })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sortMovies
// ---------------------------------------------------------------------------
describe("sortMovies", () => {
  it("sorts by user_rating descending", () => {
    const movies = [
      makeMovie({ id: 1, user_rating: 5 }),
      makeMovie({ id: 2, user_rating: 9 }),
      makeMovie({ id: 3, user_rating: 3 }),
    ];
    const sorted = sortMovies(movies, "user_rating", "desc");
    expect(sorted.map((m) => m.id)).toEqual([2, 1, 3]);
  });

  it("sorts by user_rating ascending", () => {
    const movies = [
      makeMovie({ id: 1, user_rating: 5 }),
      makeMovie({ id: 2, user_rating: 9 }),
      makeMovie({ id: 3, user_rating: 3 }),
    ];
    const sorted = sortMovies(movies, "user_rating", "asc");
    expect(sorted.map((m) => m.id)).toEqual([3, 1, 2]);
  });

  it("sorts by global rating", () => {
    const movies = [
      makeMovie({ id: 1, rating: 6.0 }),
      makeMovie({ id: 2, rating: 8.5 }),
      makeMovie({ id: 3, rating: 7.0 }),
    ];
    const sorted = sortMovies(movies, "rating", "desc");
    expect(sorted.map((m) => m.id)).toEqual([2, 3, 1]);
  });

  it("sorts by year descending", () => {
    const movies = [
      makeMovie({ id: 1, year: 2000 }),
      makeMovie({ id: 2, year: 2020 }),
      makeMovie({ id: 3, year: 2010 }),
    ];
    const sorted = sortMovies(movies, "year", "desc");
    expect(sorted.map((m) => m.id)).toEqual([2, 3, 1]);
  });

  it("sorts by year ascending", () => {
    const movies = [
      makeMovie({ id: 1, year: 2000 }),
      makeMovie({ id: 2, year: 2020 }),
      makeMovie({ id: 3, year: 2010 }),
    ];
    const sorted = sortMovies(movies, "year", "asc");
    expect(sorted.map((m) => m.id)).toEqual([1, 3, 2]);
  });

  it("sorts by title alphabetically descending", () => {
    const movies = [
      makeMovie({ id: 1, title: "Casablanca" }),
      makeMovie({ id: 2, title: "Avatar" }),
      makeMovie({ id: 3, title: "Zodiac" }),
    ];
    const sorted = sortMovies(movies, "title", "desc");
    expect(sorted.map((m) => m.id)).toEqual([3, 1, 2]);
  });

  it("sorts by title alphabetically ascending", () => {
    const movies = [
      makeMovie({ id: 1, title: "Casablanca" }),
      makeMovie({ id: 2, title: "Avatar" }),
      makeMovie({ id: 3, title: "Zodiac" }),
    ];
    const sorted = sortMovies(movies, "title", "asc");
    expect(sorted.map((m) => m.id)).toEqual([2, 1, 3]);
  });

  it("sorts by created_at descending", () => {
    const movies = [
      makeMovie({ id: 1, created_at: "2024-01-01T00:00:00Z" }),
      makeMovie({ id: 2, created_at: "2024-03-01T00:00:00Z" }),
      makeMovie({ id: 3, created_at: "2024-02-01T00:00:00Z" }),
    ];
    const sorted = sortMovies(movies, "created_at", "desc");
    expect(sorted.map((m) => m.id)).toEqual([2, 3, 1]);
  });

  it("sorts by rated_at descending with nulls last", () => {
    const movies = [
      makeMovie({ id: 1, rated_at: "2024-01-01T00:00:00Z" }),
      makeMovie({ id: 2, rated_at: null }),
      makeMovie({ id: 3, rated_at: "2024-03-01T00:00:00Z" }),
    ];
    const sorted = sortMovies(movies, "rated_at", "desc");
    expect(sorted[0].id).toBe(3);
    expect(sorted[1].id).toBe(1);
  });

  it("treats null user_rating as -1 when sorting descending", () => {
    const movies = [
      makeMovie({ id: 1, user_rating: null }),
      makeMovie({ id: 2, user_rating: 5 }),
    ];
    const sorted = sortMovies(movies, "user_rating", "desc");
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  it("does not mutate the input array", () => {
    const movies = [makeMovie({ id: 1, year: 2020 }), makeMovie({ id: 2, year: 2000 })];
    const original = [...movies];
    sortMovies(movies, "year", "asc");
    expect(movies[0].id).toBe(original[0].id);
  });
});

// ---------------------------------------------------------------------------
// extractGenres
// ---------------------------------------------------------------------------
describe("extractGenres", () => {
  it("extracts unique genres sorted alphabetically", () => {
    const movies = [
      makeMovie({ genre: "Drama, Thriller" }),
      makeMovie({ genre: "Comedy, Drama" }),
    ];
    expect(extractGenres(movies)).toEqual(["Comedy", "Drama", "Thriller"]);
  });

  it("handles movies with null genre", () => {
    const movies = [makeMovie({ genre: null }), makeMovie({ genre: "Horror" })];
    expect(extractGenres(movies)).toEqual(["Horror"]);
  });

  it("returns empty array when all genres are null", () => {
    expect(extractGenres([makeMovie({ genre: null })])).toEqual([]);
  });

  it("deduplicates genres across movies", () => {
    const movies = [makeMovie({ genre: "Drama" }), makeMovie({ genre: "Drama" })];
    expect(extractGenres(movies)).toEqual(["Drama"]);
  });

  it("normalizes Polish genre labels before deduplicating", () => {
    const movies = [
      makeMovie({ genre: "Dramat,Kryminał,Drama" }),
      makeMovie({ genre: "Drama , Crime" }),
      makeMovie({ genre: "Animacja" }),
    ];

    expect(extractGenres(movies)).toEqual(["Animation", "Crime", "Drama"]);
  });
});

// ---------------------------------------------------------------------------
// extractSources
// ---------------------------------------------------------------------------
describe("extractSources", () => {
  it("extracts unique sources sorted alphabetically", () => {
    const movies = [
      makeMovie({ source: "tmdb" }),
      makeMovie({ source: "manual" }),
      makeMovie({ source: "tmdb" }),
    ];
    expect(extractSources(movies)).toEqual(["manual", "tmdb"]);
  });

  it("handles movies with null source", () => {
    const movies = [makeMovie({ source: null }), makeMovie({ source: "tmdb" })];
    expect(extractSources(movies)).toEqual(["tmdb"]);
  });

  it("returns empty array when no sources", () => {
    expect(extractSources([makeMovie({ source: null })])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractYears
// ---------------------------------------------------------------------------
describe("extractYears", () => {
  it("extracts unique years sorted descending", () => {
    const movies = [
      makeMovie({ year: 2010 }),
      makeMovie({ year: 2020 }),
      makeMovie({ year: 2010 }),
      makeMovie({ year: 2015 }),
    ];
    expect(extractYears(movies)).toEqual([2020, 2015, 2010]);
  });

  it("handles movies with null year", () => {
    const movies = [makeMovie({ year: null }), makeMovie({ year: 2020 })];
    expect(extractYears(movies)).toEqual([2020]);
  });

  it("returns empty array when all years are null", () => {
    expect(extractYears([makeMovie({ year: null })])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterRatedRecommendations
// ---------------------------------------------------------------------------
describe("filterRatedRecommendations", () => {
  it("removes recommendations with rated tmdb_ids", () => {
    const ratedIds = new Set<number | null | undefined>([10, 20]);
    const groups = [makeGroup("By Genre", [makeRec(10), makeRec(30)])];
    const result = filterRatedRecommendations(groups, ratedIds);
    expect(result[0].recommendations).toHaveLength(1);
    expect(result[0].recommendations[0].tmdb_id).toBe(30);
  });

  it("removes groups that become empty after filtering", () => {
    const ratedIds = new Set<number | null | undefined>([10]);
    const groups = [makeGroup("By Genre", [makeRec(10)])];
    const result = filterRatedRecommendations(groups, ratedIds);
    expect(result).toHaveLength(0);
  });

  it("skips filtering when skipFilter=true", () => {
    const ratedIds = new Set<number | null | undefined>([10]);
    const groups = [makeGroup("Random", [makeRec(10), makeRec(20)])];
    const result = filterRatedRecommendations(groups, ratedIds, true);
    expect(result[0].recommendations).toHaveLength(2);
  });

  it("returns all groups when ratedIds is empty", () => {
    const ratedIds = new Set<number | null | undefined>();
    const groups = [makeGroup("By Genre", [makeRec(1), makeRec(2)])];
    const result = filterRatedRecommendations(groups, ratedIds);
    expect(result[0].recommendations).toHaveLength(2);
  });

  it("does not mutate input groups", () => {
    const ratedIds = new Set<number | null | undefined>([1]);
    const groups = [makeGroup("By Genre", [makeRec(1), makeRec(2)])];
    filterRatedRecommendations(groups, ratedIds);
    expect(groups[0].recommendations).toHaveLength(2);
  });
});

describe("getRatedMovieTmdbIds", () => {
  it("collects only rated movie tmdb ids", () => {
    const result = getRatedMovieTmdbIds([
      makeMovie({ tmdb_id: 10, user_rating: 8, type: "movie" }),
      makeMovie({ id: 2, tmdb_id: 20, user_rating: 7, type: "tv" }),
      makeMovie({ id: 3, tmdb_id: 30, user_rating: null, type: "movie" }),
    ]);
    expect([...result]).toEqual([10]);
  });

  it("preserves movie recommendations when a rated tv row shares the tmdb_id", () => {
    const ratedIds = getRatedMovieTmdbIds([
      makeMovie({ tmdb_id: 10, user_rating: 9, type: "tv" }),
    ]);
    const groups = [makeGroup("By Genre", [makeRec(10), makeRec(20)])];
    const result = filterRatedRecommendations(groups, ratedIds);
    expect(result[0].recommendations.map((r) => r.tmdb_id)).toEqual([10, 20]);
  });
});

// ---------------------------------------------------------------------------
// deduplicateRecommendations
// ---------------------------------------------------------------------------
describe("deduplicateRecommendations", () => {
  it("removes duplicate tmdb_ids across groups", () => {
    const groups = [
      makeGroup("Group A", [makeRec(1), makeRec(2)]),
      makeGroup("Group B", [makeRec(2), makeRec(3)]),
    ];
    const result = deduplicateRecommendations(groups);
    const groupA = result.find((g) => g.reason === "Group A")!;
    const groupB = result.find((g) => g.reason === "Group B")!;
    expect(groupA.recommendations.map((r) => r.tmdb_id)).toEqual([1, 2]);
    expect(groupB.recommendations.map((r) => r.tmdb_id)).toEqual([3]);
  });

  it("removes groups that become empty after deduplication", () => {
    const groups = [
      makeGroup("Group A", [makeRec(1)]),
      makeGroup("Group B", [makeRec(1)]),
    ];
    const result = deduplicateRecommendations(groups);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("Group A");
  });

  it("preserves all items when no duplicates exist", () => {
    const groups = [
      makeGroup("Group A", [makeRec(1), makeRec(2)]),
      makeGroup("Group B", [makeRec(3), makeRec(4)]),
    ];
    const result = deduplicateRecommendations(groups);
    const total = result.reduce((acc, g) => acc + g.recommendations.length, 0);
    expect(total).toBe(4);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateRecommendations([])).toEqual([]);
  });
});
