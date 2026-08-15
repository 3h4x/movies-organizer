// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "@/lib/engines";
import type { Movie } from "@/lib/db";
import type { TmdbSearchResult } from "@/lib/tmdb";
import { MOOD_PRESETS, MOOD_KEYS } from "@/lib/mood-presets";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockDiscoverByMood } = vi.hoisted(() => ({
  mockDiscoverByMood: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  discoverByMood: mockDiscoverByMood,
}));

import { moodEngine } from "@/lib/engines/mood";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMovie(
  overrides: Partial<Movie> & { id: number; title: string },
): Movie {
  return {
    year: 2010,
    genre: "Drama",
    director: null,
    writer: null,
    actors: null,
    rating: 7.5,
    poster_url: null,
    source: "tmdb",
    imdb_id: null,
    tmdb_id: overrides.id * 100,
    type: "movie",
    file_path: null,
    extra_files: null,
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
  mockDiscoverByMood.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// MOOD_PRESETS
// ---------------------------------------------------------------------------

describe("MOOD_PRESETS", () => {
  it("has at least 6 presets", () => {
    expect(MOOD_KEYS.length).toBeGreaterThanOrEqual(6);
  });

  it("each preset has label, icon, and reason", () => {
    for (const key of MOOD_KEYS) {
      const preset = MOOD_PRESETS[key];
      expect(preset.label).toBeTruthy();
      expect(preset.icon).toBeTruthy();
      expect(preset.reason).toBeTruthy();
    }
  });

  it("comfort_rewatch has comfortRewatch flag", () => {
    expect(MOOD_PRESETS.comfort_rewatch.comfortRewatch).toBe(true);
  });

  it("foreign preset has languages array", () => {
    expect(MOOD_PRESETS.foreign.languages?.length).toBeGreaterThan(0);
  });

  it("short preset has maxRuntime", () => {
    expect(MOOD_PRESETS.short.maxRuntime).toBeLessThanOrEqual(100);
  });

  it("includes multiple horror presets", () => {
    const horrorKeys = MOOD_KEYS.filter((key) => key.startsWith("horror_"));
    expect(horrorKeys.length).toBeGreaterThanOrEqual(4);
    for (const key of horrorKeys) {
      expect(MOOD_PRESETS[key].genreIds).toContain(27);
    }
  });
});

// ---------------------------------------------------------------------------
// moodEngine — TMDb-backed moods
// ---------------------------------------------------------------------------

describe("moodEngine (TMDb-backed)", () => {
  it("returns empty when discoverByMood yields no results", async () => {
    const library = [makeMovie({ id: 1, title: "Film", genre: "Comedy", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockDiscoverByMood.mockResolvedValue([]);
    expect(await moodEngine(ctx, "light_funny")).toEqual([]);
  });

  it("returns a single group with type 'mood'", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", genre: "Comedy" })];
    const ctx = buildContext(library, new Set());
    mockDiscoverByMood.mockResolvedValue([
      makeResult({ tmdb_id: 500, title: "Funny Movie" }),
    ]);

    const result = await moodEngine(ctx, "light_funny");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("mood");
    expect(result[0].reason).toBeTruthy();
    expect(result[0].recommendations[0].title).toBe("Funny Movie");
  });

  it("excludes movies already in library", async () => {
    const library = [makeMovie({ id: 1, title: "Film A", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    mockDiscoverByMood.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Film A" }),
      makeResult({ tmdb_id: 200, title: "New Film" }),
    ]);

    const result = await moodEngine(ctx, "light_funny");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Film A");
    expect(titles).toContain("New Film");
  });

  it("excludes dismissed movies", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set([999]));
    mockDiscoverByMood.mockResolvedValue([
      makeResult({ tmdb_id: 999, title: "Dismissed" }),
      makeResult({ tmdb_id: 888, title: "Visible" }),
    ]);

    const result = await moodEngine(ctx, "mind_bender");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Visible");
  });

  it("limits results to 30", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set());
    mockDiscoverByMood.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) =>
        makeResult({ tmdb_id: i + 1, title: `Film ${i}` }),
      ),
    );

    const result = await moodEngine(ctx, "feel_good");
    expect(result[0].recommendations).toHaveLength(30);
  });

  it("passes preset genreIds to discoverByMood", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set());
    await moodEngine(ctx, "light_funny");

    expect(mockDiscoverByMood).toHaveBeenCalledWith(
      expect.objectContaining({
        genreIds: MOOD_PRESETS.light_funny.genreIds,
      }),
    );
  });

  it("passes maxRuntime for short mood", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set());
    await moodEngine(ctx, "short");

    expect(mockDiscoverByMood).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRuntime: MOOD_PRESETS.short.maxRuntime,
      }),
    );
  });

  it("passes languages for foreign mood", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set());
    await moodEngine(ctx, "foreign");

    expect(mockDiscoverByMood).toHaveBeenCalledWith(
      expect.objectContaining({
        languages: MOOD_PRESETS.foreign.languages,
      }),
    );
  });

  it("filters out excluded genres from config", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set(), {
      excluded_genres: ["Horror"],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
    });
    mockDiscoverByMood.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Horror Film", genre: "Horror" }),
      makeResult({ tmdb_id: 200, title: "Comedy Film", genre: "Comedy" }),
    ]);

    const result = await moodEngine(ctx, "light_funny");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Horror Film");
    expect(titles).toContain("Comedy Film");
  });

  it("filters out movies below min_year from config", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set(), {
      excluded_genres: [],
      min_year: 2010,
      min_rating: null,
      max_per_group: 10,
    });
    mockDiscoverByMood.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Old Film", year: 1990 }),
      makeResult({ tmdb_id: 200, title: "New Film", year: 2015 }),
    ]);

    const result = await moodEngine(ctx, "light_funny");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Old Film");
    expect(titles).toContain("New Film");
  });

  it("filters out movies below min_rating from config", async () => {
    const library = [makeMovie({ id: 1, title: "Film A" })];
    const ctx = buildContext(library, new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: 8.0,
      max_per_group: 10,
    });
    mockDiscoverByMood.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Low Rated", rating: 6.0 }),
      makeResult({ tmdb_id: 200, title: "High Rated", rating: 8.5 }),
    ]);

    const result = await moodEngine(ctx, "light_funny");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Low Rated");
    expect(titles).toContain("High Rated");
  });
});

// ---------------------------------------------------------------------------
// moodEngine — comfort_rewatch (library-backed)
// ---------------------------------------------------------------------------

describe("moodEngine (comfort_rewatch)", () => {
  it("returns empty when library is empty", async () => {
    const ctx = buildContext([], new Set());
    expect(await moodEngine(ctx, "comfort_rewatch")).toEqual([]);
    expect(mockDiscoverByMood).not.toHaveBeenCalled();
  });

  it("does not call discoverByMood", async () => {
    const library = [makeMovie({ id: 1, title: "Fav Film", tmdb_id: 100, user_rating: 9 })];
    const ctx = buildContext(library, new Set());
    await moodEngine(ctx, "comfort_rewatch");
    expect(mockDiscoverByMood).not.toHaveBeenCalled();
  });

  it("includes highly-rated library movies (user_rating >= 8)", async () => {
    const library = [
      makeMovie({ id: 1, title: "Top Pick", tmdb_id: 100, user_rating: 9 }),
      makeMovie({ id: 2, title: "Low Rated", tmdb_id: 200, user_rating: 4 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await moodEngine(ctx, "comfort_rewatch");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).toContain("Top Pick");
    expect(titles).not.toContain("Low Rated");
  });

  it("includes unrated library movies with tmdb rating >= 7", async () => {
    const library = [
      makeMovie({ id: 1, title: "Unwatched Good", tmdb_id: 100, rating: 7.8 }),
      makeMovie({ id: 2, title: "Unwatched Meh", tmdb_id: 200, rating: 5.5 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await moodEngine(ctx, "comfort_rewatch");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).toContain("Unwatched Good");
    expect(titles).not.toContain("Unwatched Meh");
  });

  it("treats user_rating=0 as unrated and falls back to tmdb rating", async () => {
    const library = [
      makeMovie({ id: 1, title: "Zero Rated Good TMDb", tmdb_id: 100, user_rating: 0, rating: 8.0 }),
      makeMovie({ id: 2, title: "Zero Rated Bad TMDb", tmdb_id: 200, user_rating: 0, rating: 5.0 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await moodEngine(ctx, "comfort_rewatch");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).toContain("Zero Rated Good TMDb");
    expect(titles).not.toContain("Zero Rated Bad TMDb");
  });

  it("excludes dismissed movies", async () => {
    const library = [
      makeMovie({ id: 1, title: "Dismissed", tmdb_id: 100, user_rating: 9 }),
      makeMovie({ id: 2, title: "Kept", tmdb_id: 200, user_rating: 8 }),
    ];
    const ctx = buildContext(library, new Set([100]));
    const result = await moodEngine(ctx, "comfort_rewatch");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Kept");
  });

  it("sorts by user_rating desc then tmdb rating desc", async () => {
    const library = [
      makeMovie({ id: 1, title: "Mid", tmdb_id: 100, user_rating: 8 }),
      makeMovie({ id: 2, title: "Best", tmdb_id: 200, user_rating: 10 }),
      makeMovie({ id: 3, title: "Good", tmdb_id: 300, user_rating: 9 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await moodEngine(ctx, "comfort_rewatch");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles[0]).toBe("Best");
    expect(titles[1]).toBe("Good");
    expect(titles[2]).toBe("Mid");
  });

  it("limits comfort picks to 30", async () => {
    const library = Array.from({ length: 50 }, (_, i) =>
      makeMovie({ id: i + 1, title: `Film ${i}`, tmdb_id: (i + 1) * 10, user_rating: 9 }),
    );
    const ctx = buildContext(library, new Set());
    const result = await moodEngine(ctx, "comfort_rewatch");
    expect(result[0].recommendations).toHaveLength(30);
  });

  it("returns empty when no qualifying movies", async () => {
    const library = [
      makeMovie({ id: 1, title: "Meh", tmdb_id: 100, user_rating: 5 }),
      makeMovie({ id: 2, title: "Bad", tmdb_id: 200, user_rating: 3 }),
    ];
    const ctx = buildContext(library, new Set());
    expect(await moodEngine(ctx, "comfort_rewatch")).toEqual([]);
  });

  it("excludes movies without tmdb_id from comfort picks", async () => {
    const library = [
      makeMovie({ id: 1, title: "No ID Film", tmdb_id: undefined as unknown as number, user_rating: 9 }),
      makeMovie({ id: 2, title: "Has ID Film", tmdb_id: 200, user_rating: 9 }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await moodEngine(ctx, "comfort_rewatch");
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("No ID Film");
    expect(titles).toContain("Has ID Film");
  });
});
