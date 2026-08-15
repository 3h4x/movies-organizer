import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Prevent tmdb.ts from opening the real production DB when resolving the API key
// via getDbApiKey(). Tests that resolve the API key set process.env.TMDB_API_KEY
// so the env-var path is taken; the DB path is never needed.
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => { throw new Error("no db in tmdb tests"); }),
  getSetting: vi.fn(() => null),
}));

import {
  searchTmdb,
  getTmdbRecommendations,
  getTmdbSimilar,
  getTmdbHealth,
  genreNameToId,
  getMovieLocalized,
  getPolishTitle,
  getTmdbMovieDetails,
  getTmdbCollectionParts,
  getMovieCredits,
  searchTmdbPl,
  clearTmdbCache,
  clearTmdbHealthTracker,
  searchTmdbForUi,
} from "@/lib/tmdb";

const mockFetch = vi.fn();
global.fetch = mockFetch;

afterEach(() => {
  clearTmdbCache();
  clearTmdbHealthTracker();
  vi.useRealTimers();
});

describe("tmdb client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    clearTmdbHealthTracker();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("searches movies by query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 27205,
            title: "Inception",
            release_date: "2010-07-16",
            genre_ids: [28, 878],
            vote_average: 8.365,
            poster_path: "/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg",
          },
        ],
      }),
    });

    const results = await searchTmdb("inception");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Inception");
    expect(results[0].year).toBe(2010);
    expect(results[0].tmdb_id).toBe(27205);
    expect(results[0].rating).toBeCloseTo(8.4, 0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=inception"),
      expect.any(Object),
    );
  });

  it("prefers exact title matches over looser TMDb matches", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 999001,
            title: "The Secret House",
            original_title: "Secret House",
            release_date: "2025-07-20",
            genre_ids: [53, 27, 9648],
            vote_average: 8.5,
            poster_path: "/secret-house.jpg",
          },
          {
            id: 999002,
            title: "Marrowbone",
            original_title: "Marrowbone",
            release_date: "2017-10-27",
            genre_ids: [53, 27, 9648],
            vote_average: 7.1,
            poster_path: "/marrowbone.jpg",
          },
        ],
      }),
    });

    const results = await searchTmdb("marrowbone");
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Marrowbone");
    expect(results[1].title).toBe("The Secret House");
  });

  it("preserves literal title tokens that filename cleanup would strip", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 777001,
            title: "Neon City",
            original_title: "Neon City",
            release_date: "1991-03-01",
            genre_ids: [878],
            vote_average: 8.7,
            poster_path: null,
          },
          {
            id: 777002,
            title: "Noir",
            original_title: "Noir",
            release_date: "2021-09-10",
            genre_ids: [18],
            vote_average: 5.4,
            poster_path: null,
          },
        ],
      }),
    });

    const results = await searchTmdb("Noir");
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Noir");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", text: async () => "" });

    await expect(searchTmdb("inception")).rejects.toThrow("tmdb_api_error:401");
  });

  it("tracks successful live TMDb requests by helper", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 27205,
            title: "Inception",
            release_date: "2010-07-16",
            genre_ids: [28, 878],
            vote_average: 8.365,
            poster_path: "/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg",
          },
        ],
      }),
    });

    await searchTmdb("inception");

    expect(getTmdbHealth()).toMatchObject({
      liveRequestCount: 1,
      cacheHitCount: 0,
      retryCount: 0,
      nonOkCount: 0,
      helpers: {
        searchTmdb: {
          liveRequestCount: 1,
          cacheHitCount: 0,
          retryCount: 0,
          nonOkCount: 0,
        },
      },
    });
  });

  it("tracks cache hits for localized lookups", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Incepcja",
        overview: "Opis",
      }),
    });

    const first = await getMovieLocalized(27205);
    const second = await getMovieLocalized(27205);

    expect(first).toEqual(second);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getTmdbHealth()).toMatchObject({
      liveRequestCount: 1,
      cacheHitCount: 1,
      helpers: {
        getMovieLocalized: {
          liveRequestCount: 1,
          cacheHitCount: 1,
          retryCount: 0,
          nonOkCount: 0,
        },
      },
    });
  });

  it("tracks 429 retries and last rate-limit timestamp", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 27205,
              title: "Inception",
              release_date: "2010-07-16",
              genre_ids: [28, 878],
              vote_average: 8.365,
              poster_path: "/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg",
            },
          ],
        }),
      });

    const promise = searchTmdb("inception");
    await vi.runAllTimersAsync();
    await promise;

    expect(getTmdbHealth()).toMatchObject({
      liveRequestCount: 2,
      retryCount: 1,
      nonOkCount: 1,
      lastErrorStatus: 429,
      lastErrorMessage: "Too Many Requests",
      helpers: {
        searchTmdb: {
          liveRequestCount: 2,
          cacheHitCount: 0,
          retryCount: 1,
          nonOkCount: 1,
        },
      },
    });
    expect(getTmdbHealth().last429At).toBeTruthy();

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it("fetches recommendations for a tmdb id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 155,
            title: "The Dark Knight",
            release_date: "2008-07-18",
            genre_ids: [18, 28, 80],
            vote_average: 8.516,
            poster_path: "/qJ2tW6WMUDux911BTUgMe1nNaD.jpg",
          },
        ],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [{ job: "Director", name: "Christopher Nolan" }],
        },
      }),
    });

    const recs = await getTmdbRecommendations(27205);
    expect(recs).toHaveLength(1);
    expect(recs[0].title).toBe("The Dark Knight");
    expect(recs[0].year).toBe(2008);
  });

  it("fetches similar movies for a tmdb id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 157336,
            title: "Interstellar",
            release_date: "2014-11-05",
            genre_ids: [18, 878],
            vote_average: 8.4,
            poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
          },
          {
            id: 329865,
            title: "Arrival",
            release_date: "2016-11-11",
            genre_ids: [18, 878],
            vote_average: 7.9,
            poster_path: "/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
          },
        ],
      }),
    });

    const similar = await getTmdbSimilar(27205);
    expect(similar).toHaveLength(2);
    expect(similar[0].title).toBe("Interstellar");
    expect(similar[0].tmdb_id).toBe(157336);
    expect(similar[1].title).toBe("Arrival");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/movie/27205/similar"),
      expect.any(Object),
    );
  });

  it("returns empty array when similar endpoint returns error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const similar = await getTmdbSimilar(99999);
    expect(similar).toEqual([]);
  });

  it("limits similar results to 5", async () => {
    const manyResults = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i}`,
      release_date: "2020-01-01",
      genre_ids: [18],
      vote_average: 7.0,
      poster_path: null,
    }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: manyResults }),
    });

    const similar = await getTmdbSimilar(100);
    expect(similar).toHaveLength(5);
  });
});

describe("searchTmdb year fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  function okPage(id: number, year: number) {
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            id,
            title: `Film ${year}`,
            release_date: `${year}-06-01`,
            genre_ids: [18],
            vote_average: 7.0,
            poster_path: null,
          },
        ],
      }),
    };
  }

  const emptyPage = { ok: true, json: async () => ({ results: [] }) };

  it("returns first-call results when year provided and results found", async () => {
    mockFetch.mockResolvedValueOnce(okPage(1, 2020));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("year=2020"),
      expect.any(Object),
    );
  });

  it("uses year proximity as a secondary ranking signal", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 10,
            title: "Film",
            original_title: "Film",
            release_date: "2021-05-01",
            genre_ids: [],
            vote_average: 8.0,
            poster_path: null,
          },
          {
            id: 11,
            title: "Film",
            original_title: "Film",
            release_date: "2020-05-01",
            genre_ids: [],
            vote_average: 7.0,
            poster_path: null,
          },
        ],
      }),
    });

    const results = await searchTmdb("Film", 2020);
    expect(results[0].year).toBe(2020);
    expect(results[1].year).toBe(2021);
  });

  it("keeps the exact title first when unattended flows rely on the first search result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 20,
            title: "Neo Noir",
            original_title: "Neo Noir",
            release_date: "2021-05-01",
            genre_ids: [],
            vote_average: 8.8,
            poster_path: null,
          },
          {
            id: 21,
            title: "Noir",
            original_title: "Noir",
            release_date: "2021-10-01",
            genre_ids: [],
            vote_average: 6.2,
            poster_path: null,
          },
        ],
      }),
    });

    const results = await searchTmdb("Noir", 2021);
    expect(results[0].title).toBe("Noir");
    expect(results[1].title).toBe("Neo Noir");
  });

  it("tries year+1 when exact year returns no results", async () => {
    mockFetch.mockResolvedValueOnce(emptyPage).mockResolvedValueOnce(okPage(2, 2021));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(results[0].year).toBe(2021);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("year=2020");
    expect(mockFetch.mock.calls[1][0]).toContain("year=2021");
  });

  it("tries year-1 when year and year+1 both return no results", async () => {
    mockFetch
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(okPage(3, 2019));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(results[0].year).toBe(2019);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2][0]).toContain("year=2019");
  });

  it("falls back to no-year query when year, year+1, and year-1 all return no results", async () => {
    mockFetch
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(okPage(4, 2018));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    // Final call must not include a year filter
    expect(mockFetch.mock.calls[3][0]).not.toContain("year=");
  });

  it("returns empty array when all four fallbacks return no results", async () => {
    mockFetch.mockResolvedValue(emptyPage);

    const results = await searchTmdb("Film", 2020);
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("makes only one fetch call when no year is provided", async () => {
    mockFetch.mockResolvedValueOnce(emptyPage);

    const results = await searchTmdb("Film");
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("makes only one fetch call when year is null", async () => {
    mockFetch.mockResolvedValueOnce(emptyPage);

    const results = await searchTmdb("Film", null);
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not start year fallback when year is provided and first call succeeds", async () => {
    mockFetch.mockResolvedValueOnce(okPage(5, 2020));

    await searchTmdb("Film", 2020);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("genreNameToId", () => {
  it("returns the TMDb genre ID for a known genre", () => {
    expect(genreNameToId("Action")).toBe(28);
    expect(genreNameToId("Drama")).toBe(18);
    expect(genreNameToId("Sci-Fi")).toBe(878);
    expect(genreNameToId("Horror")).toBe(27);
  });

  it("returns null for an unknown genre", () => {
    expect(genreNameToId("Telenovela")).toBeNull();
    expect(genreNameToId("")).toBeNull();
  });
});

describe("getMovieLocalized", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns pl_title and description from the API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Incepcja", overview: "Film o snach." }),
    });

    const result = await getMovieLocalized(27205);
    expect(result.pl_title).toBe("Incepcja");
    expect(result.description).toBe("Film o snach.");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("language=pl-PL"),
      expect.any(Object),
    );
  });

  it("returns nulls on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await getMovieLocalized(99999);
    expect(result).toEqual({ pl_title: null, description: null });
  });

  it("returns nulls when title and overview are missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const result = await getMovieLocalized(1);
    expect(result).toEqual({ pl_title: null, description: null });
  });

  it("falls back to English description when Polish overview is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Incepcja" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ overview: "A thief who steals corporate secrets." }),
    });
    const result = await getMovieLocalized(27205);
    expect(result.pl_title).toBe("Incepcja");
    expect(result.description).toBe("A thief who steals corporate secrets.");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("language=pl-PL"),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("language=en-US"),
      expect.any(Object),
    );
  });
});

describe("getMovieLocalized — caching", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns cached result on second call without re-fetching", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Incepcja", overview: "Film o snach." }),
    });

    const first = await getMovieLocalized(27205);
    const second = await getMovieLocalized(27205);

    expect(first).toEqual(second);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed API responses", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Incepcja", overview: "Opis." }),
      });

    const first = await getMovieLocalized(27205);
    expect(first).toEqual({ pl_title: null, description: null });

    const second = await getMovieLocalized(27205);
    expect(second.pl_title).toBe("Incepcja");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-fetches after the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Incepcja", overview: "Opis." }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Nowy tytuł", overview: "Nowy opis." }),
        });

      await getMovieLocalized(27205);
      vi.advanceTimersByTime(3_600_001); // past 1-hour TTL
      const result = await getMovieLocalized(27205);

      expect(result.pl_title).toBe("Nowy tytuł");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches independently per tmdbId", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Film A", overview: "Opis A." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Film B", overview: "Opis B." }),
      });

    const a = await getMovieLocalized(1);
    const b = await getMovieLocalized(2);

    expect(a.pl_title).toBe("Film A");
    expect(b.pl_title).toBe("Film B");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Both should now be cached
    await getMovieLocalized(1);
    await getMovieLocalized(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("getTmdbMovieDetails — caching", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  const okCredits = {
    ok: true,
    json: async () => ({
      credits: {
        crew: [{ job: "Director", name: "Christopher Nolan" }],
        cast: [],
      },
    }),
  };

  it("returns cached result on second call without re-fetching", async () => {
    mockFetch.mockResolvedValueOnce(okCredits);

    const first = await getTmdbMovieDetails(27205);
    const second = await getTmdbMovieDetails(27205);

    expect(first).toEqual(second);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed API responses", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(okCredits);

    const first = await getTmdbMovieDetails(27205);
    expect(first).toEqual({ director: null, writer: null, actors: null });

    const second = await getTmdbMovieDetails(27205);
    expect(second.director).toBe("Christopher Nolan");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-fetches after the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(okCredits)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            credits: {
              crew: [{ job: "Director", name: "Denis Villeneuve" }],
              cast: [],
            },
          }),
        });

      await getTmdbMovieDetails(27205);
      vi.advanceTimersByTime(3_600_001);
      const result = await getTmdbMovieDetails(27205);

      expect(result.director).toBe("Denis Villeneuve");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getPolishTitle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns the Polish title when available", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Labirynt Fauna", overview: "..." }),
    });
    expect(await getPolishTitle(268)).toBe("Labirynt Fauna");
  });

  it("returns null when the API errors", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await getPolishTitle(1)).toBeNull();
  });
});

describe("getTmdbMovieDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("parses director, writer and top actors from credits", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [
            { job: "Director", name: "Christopher Nolan" },
            { job: "Screenplay", name: "Christopher Nolan" },
          ],
          cast: [
            { name: "Leonardo DiCaprio", character: "Cobb" },
            { name: "Joseph Gordon-Levitt", character: "Arthur" },
          ],
        },
      }),
    });

    const details = await getTmdbMovieDetails(27205);
    expect(details.director).toBe("Christopher Nolan");
    expect(details.writer).toBe("Christopher Nolan");
    expect(details.actors).toBe("Leonardo DiCaprio, Joseph Gordon-Levitt");
  });

  it("reads collection metadata from movie details", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        belongs_to_collection: {
          id: 10,
          name: "Star Wars Collection",
        },
        credits: {
          crew: [],
          cast: [],
        },
      }),
    });

    const details = await getTmdbMovieDetails(11);
    expect(details.tmdb_collection_id).toBe(10);
    expect(details.tmdb_collection_name).toBe("Star Wars Collection");
    expect(details.tmdb_collection_checked).toBe(true);
  });

  it("returns nulls when credits are missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const details = await getTmdbMovieDetails(1);
    expect(details).toEqual({
      director: null,
      writer: null,
      actors: null,
      tmdb_collection_checked: true,
    });
  });

  it("returns nulls on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const details = await getTmdbMovieDetails(99999);
    expect(details).toEqual({ director: null, writer: null, actors: null });
  });

  it("limits actors to 5 names", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [],
          cast: Array.from({ length: 10 }, (_, i) => ({
            name: `Actor ${i + 1}`,
            character: "Someone",
          })),
        },
      }),
    });
    const details = await getTmdbMovieDetails(1);
    expect(details.actors?.split(", ")).toHaveLength(5);
  });
});

describe("getTmdbCollectionParts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("fetches collection parts as TMDb search results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        parts: [
          {
            id: 11,
            title: "Star Wars",
            release_date: "1977-05-25",
            genre_ids: [12, 878],
            vote_average: 8.2,
            poster_path: "/star-wars.jpg",
          },
        ],
      }),
    });

    const parts = await getTmdbCollectionParts(10);
    expect(parts).toEqual([
      {
        title: "Star Wars",
        year: 1977,
        genre: "Adventure, Sci-Fi",
        rating: 8.2,
        poster_url: "https://image.tmdb.org/t/p/w300/star-wars.jpg",
        tmdb_id: 11,
        imdb_id: null,
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/collection/10"),
      expect.any(Object),
    );
  });

  it("returns an empty list when the collection endpoint errors", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await getTmdbCollectionParts(999)).toEqual([]);
  });
});

describe("getMovieCredits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns directors and top cast from the credits endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        crew: [
          { id: 525, name: "Christopher Nolan", job: "Director" },
          { id: 526, name: "Emma Thomas", job: "Producer" },
        ],
        cast: [
          { id: 6193, name: "Leonardo DiCaprio", character: "Cobb" },
          { id: 24045, name: "Joseph Gordon-Levitt", character: "Arthur" },
        ],
      }),
    });

    const credits = await getMovieCredits(27205);
    expect(credits.directors).toHaveLength(1);
    expect(credits.directors[0].name).toBe("Christopher Nolan");
    expect(credits.cast).toHaveLength(2);
    expect(credits.cast[0].character).toBe("Cobb");
  });

  it("returns empty arrays on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const credits = await getMovieCredits(99999);
    expect(credits).toEqual({ directors: [], cast: [] });
  });

  it("limits cast to 5 members", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        crew: [],
        cast: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          name: `Actor ${i}`,
          character: "Someone",
        })),
      }),
    });
    const credits = await getMovieCredits(1);
    expect(credits.cast).toHaveLength(5);
  });
});

// ── fetchWithRetry behaviour (429 rate-limit handling) ───────────────────────
// These tests use fake timers to skip the exponential-backoff sleep without
// waiting real time, so they run instantly.

const rawFilm = {
  id: 999,
  title: "Retry Film",
  release_date: "2020-01-01",
  genre_ids: [18],
  vote_average: 7.5,
  poster_path: null,
};

describe("fetchWithRetry — 429 rate-limit handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    vi.useFakeTimers();
    process.env.TMDB_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("getTmdbRecommendations retries once on 429 and returns results on the next attempt", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [rawFilm] }),
      });

    const promise = getTmdbRecommendations(12345);
    await vi.advanceTimersByTimeAsync(1001); // past the 1 s first-retry delay
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Retry Film");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getTmdbRecommendations returns [] after exhausting all 3 retries", async () => {
    // All 4 attempts (attempt 0 + 3 retries) get 429.
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const promise = getTmdbRecommendations(12345);
    // Total sleep: 1 s + 2 s + 4 s = 7 s
    await vi.advanceTimersByTimeAsync(7001);
    const results = await promise;

    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("getTmdbSimilar retries on 429 and returns results on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [rawFilm] }),
      });

    const promise = getTmdbSimilar(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getMovieLocalized retries on 429 and returns data on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Retrybowiec", overview: "Opis." }),
      });

    const promise = getMovieLocalized(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const result = await promise;

    expect(result.pl_title).toBe("Retrybowiec");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getTmdbMovieDetails retries on 429 and returns credits on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credits: {
            crew: [{ job: "Director", name: "A. Director" }],
            cast: [],
          },
        }),
      });

    const promise = getTmdbMovieDetails(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const details = await promise;

    expect(details.director).toBe("A. Director");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getMovieCredits retries on 429 and returns credits on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          crew: [{ id: 1, name: "A. Director", job: "Director" }],
          cast: [],
        }),
      });

    const promise = getMovieCredits(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const credits = await promise;

    expect(credits.directors).toHaveLength(1);
    expect(credits.directors[0].name).toBe("A. Director");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("searchTmdb retries on 429 and returns results on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [rawFilm] }),
      });

    const promise = searchTmdb("Retry Film");
    await vi.advanceTimersByTimeAsync(1001);
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Retry Film");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("searchTmdb throws tmdb_api_error after exhausting all retries", async () => {
    // All 4 attempts return 429; fetchWithRetry returns the final 429 response,
    // then searchTmdb sees !res.ok and throws.
    mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests", text: async () => "" });

    const promise = searchTmdb("Retry Film");
    // Attach rejection handler BEFORE advancing timers so the rejection is not unhandled.
    const assertion = expect(promise).rejects.toThrow("tmdb_api_error:429");
    await vi.advanceTimersByTimeAsync(7001); // 1s + 2s + 4s
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

// ── searchTmdbPl ─────────────────────────────────────────────────────────────

describe("searchTmdbPl", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.TMDB_API_KEY;
  });

  function plResult(overrides: { id?: number; genre_ids?: number[]; vote_average?: number; overview?: string | null } = {}) {
    return {
      results: [
        {
          id: overrides.id ?? 42,
          genre_ids: overrides.genre_ids ?? [18, 53],
          vote_average: overrides.vote_average ?? 7.8,
          overview: overrides.overview ?? "Opis po polsku.",
        },
      ],
    };
  }

  it("returns tmdb_id, genre, rating, description on a successful match", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult() });

    const result = await searchTmdbPl("Incepcja", 2010);

    expect(result).not.toBeNull();
    expect(result!.tmdb_id).toBe(42);
    expect(result!.genre).toContain("Drama");
    expect(result!.genre).toContain("Thriller");
    expect(result!.rating).toBe(7.8);
    expect(result!.description).toBe("Opis po polsku.");
  });

  it("searches with language=pl-PL", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult() });
    await searchTmdbPl("Film", null);
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("language=pl-PL");
  });

  it("appends year to the query when provided", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult() });
    await searchTmdbPl("Film", 2015);
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("year=2015");
  });

  it("returns null when no results are found", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    const result = await searchTmdbPl("Unknown Film", null);
    expect(result).toBeNull();
  });

  it("returns null when TMDB_API_KEY is not set", async () => {
    delete process.env.TMDB_API_KEY;
    const result = await searchTmdbPl("Film", null);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const result = await searchTmdbPl("Film", null);
    expect(result).toBeNull();
  });

  it("falls back to year+1 when exact year returns no results", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValue({ ok: true, json: async () => plResult({ id: 99 }) });
    const result = await searchTmdbPl("Film", 2010);
    expect(result!.tmdb_id).toBe(99);
    const secondUrl = String(mockFetch.mock.calls[1][0]);
    expect(secondUrl).toContain("year=2011");
  });

  it("falls back to no-year query when year, year+1, and year-1 all miss", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValue({ ok: true, json: async () => plResult({ id: 77 }) });
    const result = await searchTmdbPl("Film", 2010);
    expect(result!.tmdb_id).toBe(77);
    const fourthUrl = String(mockFetch.mock.calls[3][0]);
    expect(fourthUrl).not.toContain("year=");
  });

  it("maps description to null when overview is empty string", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult({ overview: "" }) });
    const result = await searchTmdbPl("Film", null);
    expect(result!.description).toBeNull();
  });
});

describe("searchTmdbForUi — person fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTmdbCache();
    clearTmdbHealthTracker();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("falls back to person filmography when direct movie search is empty", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, name: "Mia Goth", popularity: 15, known_for_department: "Acting" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [
            {
              id: 950387,
              title: "Pearl",
              release_date: "2022-09-16",
              genre_ids: [27],
              vote_average: 7.2,
              poster_path: "/pearl.jpg",
              popularity: 30,
            },
            {
              id: 760104,
              title: "X",
              release_date: "2022-03-18",
              genre_ids: [27],
              vote_average: 6.8,
              poster_path: "/x.jpg",
              popularity: 25,
            },
          ],
          crew: [],
        }),
      });

    const results = await searchTmdbForUi("mia goth");
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Pearl");
    expect(results[1].title).toBe("X");
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/search/person?query=mia%20goth"),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/person/1/movie_credits"),
      expect.any(Object),
    );
  });

  it("deduplicates person fallback filmography results by tmdb_id", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 10, name: "Director One", popularity: 12, known_for_department: "Directing" },
            { id: 11, name: "Actor Two", popularity: 11, known_for_department: "Acting" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [],
          crew: [
            {
              id: 101,
              title: "Shared Movie",
              release_date: "2021-01-01",
              genre_ids: [18],
              vote_average: 7.3,
              poster_path: "/shared-a.jpg",
              popularity: 18,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [
            {
              id: 101,
              title: "Shared Movie",
              release_date: "2021-01-01",
              genre_ids: [18],
              vote_average: 7.3,
              poster_path: "/shared-b.jpg",
              popularity: 22,
            },
            {
              id: 102,
              title: "Unique Movie",
              release_date: "2020-01-01",
              genre_ids: [35],
              vote_average: 6.5,
              poster_path: "/unique.jpg",
              popularity: 10,
            },
          ],
          crew: [],
        }),
      });

    const results = await searchTmdbForUi("shared person");
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.tmdb_id)).toEqual([101, 102]);
    expect(results[0].poster_url).toContain("/shared-b.jpg");
  });
});
