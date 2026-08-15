// tamtam inspected 2026-05-21
import { describe, expect, it } from "vitest";
import {
  buildHash,
  getTabNavigationState,
  movieFromTmdbSnapshot,
  parseHashValue,
  resolvePendingMovieHash,
} from "@/app/page";
import type { Movie } from "@/lib/types";

const baseMovie: Movie = {
  id: 7,
  title: "Heat",
  year: 1995,
  genre: "Crime",
  director: null,
  writer: null,
  actors: null,
  rating: 8.3,
  user_rating: null,
  poster_url: null,
  source: "tmdb",
  type: "movie",
  tmdb_id: 949,
  rated_at: null,
  created_at: "2026-05-18T00:00:00.000Z",
};

describe("buildHash", () => {
  it("keeps a pending TMDb movie hash until the movie resolves", () => {
    expect(
      buildHash({
        selectedMovie: null,
        pendingMovieHash: "949",
        activeTab: "recommendations",
        personFilter: "",
        searchQuery: "",
        invalidMoodKey: null,
        activeMood: null,
        recCategory: "all",
      }),
    ).toBe("#movie/949");
  });

  it("keeps a pending local movie hash until the movie resolves", () => {
    expect(
      buildHash({
        selectedMovie: null,
        pendingMovieHash: "local/7",
        activeTab: "library",
        personFilter: "",
        searchQuery: "",
        invalidMoodKey: null,
        activeMood: null,
        recCategory: "all",
      }),
    ).toBe("#movie/local/7");
  });

  it("prefers the selected movie hash over other UI state", () => {
    expect(
      buildHash({
        selectedMovie: baseMovie,
        pendingMovieHash: "local/7",
        activeTab: "tv",
        personFilter: "",
        searchQuery: "",
        invalidMoodKey: "cozy",
        activeMood: "comfort_rewatch",
        recCategory: "movie",
      }),
    ).toBe("#movie/949");
  });
});

describe("resolvePendingMovieHash", () => {
  it("keeps an unresolved movie hash while the library is still loading", () => {
    expect(
      resolvePendingMovieHash({
        pendingMovieHash: "949",
        initialLoad: true,
        movies: [],
      }),
    ).toEqual({ selectedMovie: null, nextPendingMovieHash: "949" });
  });

  it("clears an unresolved movie hash after an empty library has loaded", () => {
    const resolved = resolvePendingMovieHash({
      pendingMovieHash: "949",
      initialLoad: false,
      movies: [],
    });

    expect(resolved).toEqual({
      selectedMovie: null,
      nextPendingMovieHash: null,
    });
    expect(
      buildHash({
        selectedMovie: resolved.selectedMovie,
        pendingMovieHash: resolved.nextPendingMovieHash,
        activeTab: "tv",
        personFilter: "",
        searchQuery: "",
        invalidMoodKey: null,
        activeMood: null,
        recCategory: "all",
      }),
    ).toBe("#tv");
  });

  it("resolves a pending movie hash to the matching movie after loading", () => {
    expect(
      resolvePendingMovieHash({
        pendingMovieHash: "949",
        initialLoad: false,
        movies: [baseMovie],
      }),
    ).toEqual({ selectedMovie: baseMovie, nextPendingMovieHash: null });
  });

  it("does not partially resolve malformed TMDb movie hashes", () => {
    expect(
      resolvePendingMovieHash({
        pendingMovieHash: "949abc",
        initialLoad: false,
        movies: [baseMovie],
      }),
    ).toEqual({ selectedMovie: null, nextPendingMovieHash: null });
  });

  it("does not partially resolve malformed local movie hashes", () => {
    expect(
      resolvePendingMovieHash({
        pendingMovieHash: "local/7x",
        initialLoad: false,
        movies: [baseMovie],
      }),
    ).toEqual({ selectedMovie: null, nextPendingMovieHash: null });
  });
});

describe("parseHashValue", () => {
  it("keeps invalid mood hashes routable even when the segment is malformed", () => {
    expect(parseHashValue("recommendations/mood/%E0%A4%A")).toEqual({
      tab: "recommendations",
      category: "all",
      invalidMoodKey: "%E0%A4%A",
    });
  });

  it("keeps malformed search hashes from crashing decode", () => {
    expect(parseHashValue("search/%E0%A4%A")).toEqual({
      tab: "search",
      category: "%E0%A4%A",
    });
  });
});

describe("movieFromTmdbSnapshot", () => {
  it("creates a transient local movie shape for TMDb-backed deep links", () => {
    const movie = movieFromTmdbSnapshot({
      title: "Heat",
      year: 1995,
      genre: "Crime, Drama",
      director: "Michael Mann",
      writer: "Michael Mann",
      actors: "Al Pacino, Robert De Niro",
      rating: 8.3,
      poster_url: "/poster.jpg",
      tmdb_id: 949,
      imdb_id: "tt0113277",
      pl_title: "Goraczka",
      description: "A detail page loaded from TMDb.",
    });

    expect(movie).toMatchObject({
      id: -949,
      title: "Heat",
      source: "tmdb",
      tmdb_id: 949,
      user_rating: null,
      wishlist: 0,
    });
    expect(movie.created_at).toEqual(expect.any(String));
  });
});

describe("getTabNavigationState", () => {
  it("clears an invalid mood when the user returns to Discover via tab navigation", () => {
    expect(
      getTabNavigationState({
        currentInvalidMoodKey: "cozy",
        nextTab: "recommendations",
      }),
    ).toEqual({
      nextInvalidMoodKey: null,
      nextTab: "recommendations",
    });
  });

  it("preserves invalid mood state when navigating to a non-recommendations tab", () => {
    expect(
      getTabNavigationState({
        currentInvalidMoodKey: "cozy",
        nextTab: "library",
      }),
    ).toEqual({
      nextInvalidMoodKey: "cozy",
      nextTab: "library",
    });
  });
});
