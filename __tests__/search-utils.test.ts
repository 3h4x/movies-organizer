// tamtam inspected 2026-05-21
import { describe, expect, it } from "vitest";
import {
  buildTmdbMovieIndex,
  getCanonicalMatchingMovie,
  getCanonicalMovie,
  getCanonicalMovieForTmdbId,
  getSearchMatches,
  getTmdbSearchMovieState,
  shouldAutoSearchTmdb,
  upsertCanonicalTmdbMovie,
} from "@/lib/search";
import type { Movie } from "@/lib/types";
import { cleanTitle } from "@/lib/utils";

function makeMovie(overrides: Partial<Movie>): Movie {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? "Inception",
    year: overrides.year ?? 2010,
    genre: overrides.genre ?? "Sci-Fi",
    director: overrides.director ?? null,
    writer: overrides.writer ?? null,
    actors: overrides.actors ?? null,
    rating: overrides.rating ?? 8.8,
    user_rating: overrides.user_rating ?? null,
    poster_url: overrides.poster_url ?? null,
    source: overrides.source ?? "tmdb",
    type: overrides.type ?? "movie",
    tmdb_id: overrides.tmdb_id ?? 100,
    rated_at: overrides.rated_at ?? null,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    filmweb_url: overrides.filmweb_url ?? null,
    cda_url: overrides.cda_url ?? null,
    pl_title: overrides.pl_title ?? null,
    wishlist: overrides.wishlist ?? 0,
    file_path: overrides.file_path ?? null,
  };
}

describe("search utils", () => {
  it("splits library and watchlist matches for a shared query", () => {
    const movies = [
      makeMovie({ id: 1, title: "Alien", wishlist: 0 }),
      makeMovie({ id: 2, title: "Alien: Covenant", wishlist: 1 }),
    ];

    const { libraryMatches, wishlistMatches } = getSearchMatches(
      movies,
      "alien",
    );

    expect(libraryMatches.map((movie) => movie.id)).toEqual([1]);
    expect(wishlistMatches.map((movie) => movie.id)).toEqual([2]);
  });

  it("does not auto-search TMDb when the query already matches local titles", () => {
    const movies = [
      makeMovie({ id: 1, title: "Alien", wishlist: 0 }),
      makeMovie({ id: 2, title: "Aliens", wishlist: 1 }),
    ];

    expect(shouldAutoSearchTmdb(movies, "alien")).toBe(false);
  });

  it("auto-searches TMDb when the query has no local matches", () => {
    const movies = [
      makeMovie({ id: 1, title: "Alien", wishlist: 0 }),
      makeMovie({ id: 2, title: "Aliens", wishlist: 1 }),
    ];

    expect(shouldAutoSearchTmdb(movies, "blade runner")).toBe(true);
  });

  it("prefers a library row over watchlist duplicates for TMDb result state", () => {
    const movies = [
      makeMovie({
        id: 1,
        title: "Alien",
        tmdb_id: 900,
        wishlist: 1,
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      makeMovie({
        id: 2,
        title: "Alien",
        tmdb_id: 900,
        wishlist: 0,
        created_at: "2025-01-01T00:00:00.000Z",
      }),
    ];

    const state = getTmdbSearchMovieState(buildTmdbMovieIndex(movies), 900);

    expect(state.existingLabel).toBe("In library");
    expect(state.existingMovie?.id).toBe(2);
  });

  it("uses the same canonical TMDb row for hash-based movie lookup", () => {
    const movies = [
      makeMovie({
        id: 3,
        title: "Blade Runner",
        tmdb_id: 901,
        wishlist: 0,
        file_path: null,
        created_at: "2025-01-01T00:00:00.000Z",
      }),
      makeMovie({
        id: 4,
        title: "Blade Runner",
        tmdb_id: 901,
        wishlist: 0,
        file_path: "/movies/blade-runner.mkv",
        created_at: "2024-01-01T00:00:00.000Z",
      }),
    ];

    expect(getCanonicalMovieForTmdbId(movies, 901)?.id).toBe(4);
  });

  it("chooses the canonical duplicate for TMDb-driven open flows", () => {
    const candidates = [
      makeMovie({
        id: 5,
        title: "Arrival",
        tmdb_id: 902,
        wishlist: 1,
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      makeMovie({
        id: 6,
        title: "Arrival",
        tmdb_id: 902,
        wishlist: 0,
        user_rating: 9,
        file_path: "/movies/arrival.mkv",
        created_at: "2025-01-01T00:00:00.000Z",
      }),
    ];

    expect(getCanonicalMovie(candidates)?.id).toBe(6);
  });

  it("finds the canonical match for TMDb add/update duplicate checks", () => {
    const movies = [
      makeMovie({
        id: 7,
        title: "Alien - Final Cut",
        year: 1979,
        tmdb_id: null,
        wishlist: 1,
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      makeMovie({
        id: 8,
        title: "Alien: Final Cut",
        year: 1979,
        tmdb_id: null,
        wishlist: 0,
        file_path: "/movies/alien-final-cut.mkv",
        created_at: "2025-01-01T00:00:00.000Z",
      }),
    ];

    const normalizedTitle = cleanTitle("Alien: Final Cut").toLowerCase();
    const match = getCanonicalMatchingMovie(
      movies,
      (movie) =>
        cleanTitle(movie.title).toLowerCase() === normalizedTitle &&
        movie.year === 1979,
    );

    expect(match?.id).toBe(8);
  });

  it("updates only the canonical TMDb duplicate during optimistic merges", () => {
    const movies = [
      makeMovie({
        id: 9,
        title: "Heat",
        tmdb_id: 903,
        wishlist: 1,
        user_rating: null,
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      makeMovie({
        id: 10,
        title: "Heat",
        tmdb_id: 903,
        wishlist: 0,
        user_rating: 7,
        file_path: "/movies/heat.mkv",
        created_at: "2025-01-01T00:00:00.000Z",
      }),
    ];

    const insertedMovie = makeMovie({
      id: 99,
      title: "Heat",
      tmdb_id: 903,
      wishlist: 0,
      user_rating: 8,
      source: "tmdb",
    });

    const next = upsertCanonicalTmdbMovie(movies, 903, insertedMovie, {
      title: "Heat",
      user_rating: 8,
      wishlist: 0,
      source: "tmdb",
    });

    expect(next).toHaveLength(2);
    expect(next.find((movie) => movie.id === 10)?.user_rating).toBe(8);
    expect(next.find((movie) => movie.id === 9)?.user_rating).toBeNull();
    expect(next.find((movie) => movie.id === 9)?.wishlist).toBe(1);
  });
});
