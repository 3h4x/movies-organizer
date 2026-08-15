// tamtam inspected 2026-05-21
import { describe, expect, it } from "vitest";
import type { Movie } from "@/lib/types";
import { mapQuickRateKey, nextUnratedMovie } from "@/lib/quick-rate";

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    title: "Test Movie",
    year: 2020,
    genre: "Drama",
    director: null,
    writer: null,
    actors: null,
    rating: 7,
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

describe("nextUnratedMovie", () => {
  it("returns the first unrated movie when currentId is null", () => {
    const movies = [
      makeMovie({ id: 1, user_rating: 8 }),
      makeMovie({ id: 2, user_rating: null }),
      makeMovie({ id: 3, user_rating: 0 }),
    ];

    expect(nextUnratedMovie(movies, null)?.id).toBe(2);
  });

  it("returns the next unrated movie after the current movie", () => {
    const movies = [
      makeMovie({ id: 1, user_rating: null }),
      makeMovie({ id: 2, user_rating: 7 }),
      makeMovie({ id: 3, user_rating: null }),
    ];

    expect(nextUnratedMovie(movies, 1)?.id).toBe(3);
  });

  it("returns null when there is no later unrated movie", () => {
    const movies = [
      makeMovie({ id: 1, user_rating: 8 }),
      makeMovie({ id: 2, user_rating: null }),
    ];

    expect(nextUnratedMovie(movies, 2)).toBeNull();
  });
});

describe("mapQuickRateKey", () => {
  it("maps digits to ratings including 0 as 10", () => {
    expect(mapQuickRateKey("1")).toEqual({ kind: "rate", rating: 1 });
    expect(mapQuickRateKey("9")).toEqual({ kind: "rate", rating: 9 });
    expect(mapQuickRateKey("0")).toEqual({ kind: "rate", rating: 10 });
  });

  it("maps control keys to quick-rate actions", () => {
    expect(mapQuickRateKey("s")).toEqual({ kind: "skip" });
    expect(mapQuickRateKey("W")).toEqual({ kind: "wishlist" });
    expect(mapQuickRateKey("d")).toEqual({ kind: "dismiss" });
    expect(mapQuickRateKey("Escape")).toEqual({ kind: "exit" });
  });

  it("ignores unrelated keys", () => {
    expect(mapQuickRateKey("Enter")).toBeNull();
    expect(mapQuickRateKey("x")).toBeNull();
  });
});
