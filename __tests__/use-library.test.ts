// tamtam inspected 2026-05-21
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWishlistActionRequest,
  fetchLibrarySearchMovies,
} from "@/lib/hooks/useLibrary";
import { createLatestOnlyRunner } from "@/lib/latest-only-runner";
import type { Movie } from "@/lib/types";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 42,
    title: "Priscilla",
    year: 2023,
    genre: "Drama, Romance",
    director: null,
    writer: null,
    actors: null,
    rating: 6.7,
    user_rating: null,
    poster_url: null,
    source: "tmdb",
    tmdb_id: 1022796,
    type: "movie",
    file_path: null,
    filmweb_url: null,
    cda_url: null,
    pl_title: null,
    rated_at: null,
    created_at: "2026-05-12T00:00:00.000Z",
    wishlist: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildWishlistActionRequest", () => {
  it("clears wishlist without setting a rating when removing from watchlist", () => {
    const movie = makeMovie();

    const result = buildWishlistActionRequest(movie, "remove");

    expect(result.nextMovie.wishlist).toBe(0);
    expect(result.nextMovie.user_rating).toBeNull();
    expect(result.requestBody).toEqual({ wishlist: 0 });
    expect(result.toast).toBe('Removed "Priscilla" from watchlist');
  });

  it("moves a liked watchlist movie into the library with a rating", () => {
    const movie = makeMovie();

    const result = buildWishlistActionRequest(movie, "liked");

    expect(result.nextMovie.wishlist).toBe(0);
    expect(result.nextMovie.user_rating).toBe(8);
    expect(result.requestBody).toEqual({ user_rating: 8, wishlist: 0 });
  });
});

describe("library search requests", () => {
  it("does not apply a slower stale search response after a newer query starts", async () => {
    const first = createDeferred<Response>();
    const second = createDeferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const runner = createLatestOnlyRunner<Movie[]>();
    let appliedMovies: Movie[] = [];

    const firstRun = runner.run(
      () => fetchLibrarySearchMovies("twin"),
      {
        onSuccess: (movies) => {
          appliedMovies = movies;
        },
      },
    );
    const secondRun = runner.run(
      () => fetchLibrarySearchMovies("arrival"),
      {
        onSuccess: (movies) => {
          appliedMovies = movies;
        },
      },
    );

    first.resolve(Response.json([makeMovie({ id: 1, title: "Twin Peaks" })]));
    await firstRun;

    expect(appliedMovies).toEqual([]);

    second.resolve(Response.json([makeMovie({ id: 2, title: "Arrival" })]));
    await secondRun;

    expect(appliedMovies.map((movie) => movie.title)).toEqual(["Arrival"]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/movies?q=twin", {
      signal: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/movies?q=arrival", {
      signal: undefined,
    });
  });

  it("clears results when the latest search request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Search unavailable", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const runner = createLatestOnlyRunner<Movie[]>();
    let appliedMovies = [makeMovie({ title: "Previous result" })];

    await runner.run(
      () => fetchLibrarySearchMovies("arrival"),
      {
        onSuccess: (movies) => {
          appliedMovies = movies;
        },
        onError: () => {
          appliedMovies = [];
        },
      },
    );

    expect(appliedMovies).toEqual([]);
  });
});
