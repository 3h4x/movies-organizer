import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "@/lib/engines";
import type { Movie } from "@/lib/db";
import type { TmdbSearchResult } from "@/lib/tmdb";

const {
  mockGetTmdbCollectionParts,
  mockDiscoverByGenre,
  mockDiscoverByPerson,
  mockDiscoverHiddenGems,
  mockDiscoverStarStudded,
  mockDiscoverRandom,
  mockDiscoverByMood,
  mockDiscoverAiCandidates,
  mockGenreNameToId,
  mockGetMovieCredits,
  mockGetTmdbRecommendations,
  mockGetTmdbSimilar,
} = vi.hoisted(() => ({
  mockGetTmdbCollectionParts: vi.fn(),
  mockDiscoverByGenre: vi.fn(),
  mockDiscoverByPerson: vi.fn(),
  mockDiscoverHiddenGems: vi.fn(),
  mockDiscoverStarStudded: vi.fn(),
  mockDiscoverRandom: vi.fn(),
  mockDiscoverByMood: vi.fn(),
  mockDiscoverAiCandidates: vi.fn(),
  mockGenreNameToId: vi.fn(),
  mockGetMovieCredits: vi.fn(),
  mockGetTmdbRecommendations: vi.fn(),
  mockGetTmdbSimilar: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  getTmdbCollectionParts: mockGetTmdbCollectionParts,
  discoverByGenre: mockDiscoverByGenre,
  discoverByPerson: mockDiscoverByPerson,
  discoverHiddenGems: mockDiscoverHiddenGems,
  discoverStarStudded: mockDiscoverStarStudded,
  discoverRandom: mockDiscoverRandom,
  discoverByMood: mockDiscoverByMood,
  discoverAiCandidates: mockDiscoverAiCandidates,
  genreNameToId: mockGenreNameToId,
  getMovieCredits: mockGetMovieCredits,
  getTmdbRecommendations: mockGetTmdbRecommendations,
  getTmdbSimilar: mockGetTmdbSimilar,
}));

import { franchiseEngine } from "@/lib/engines/franchise";

function makeMovie(overrides: Partial<Movie> & { id: number; title: string }): Movie {
  return {
    year: 2010,
    genre: "Adventure",
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
    genre: "Adventure",
    rating: 7.5,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetTmdbCollectionParts.mockResolvedValue([]);
});

describe("franchiseEngine", () => {
  it("returns empty when no library movie has collection metadata", async () => {
    const ctx = buildContext([makeMovie({ id: 1, title: "Standalone" })], new Set());
    expect(await franchiseEngine(ctx)).toEqual([]);
    expect(mockGetTmdbCollectionParts).not.toHaveBeenCalled();
  });

  it("suggests only missing collection parts", async () => {
    const library = [
      makeMovie({
        id: 1,
        title: "Star Wars",
        tmdb_id: 11,
        tmdb_collection_id: 10,
        tmdb_collection_name: "Star Wars Collection",
      }),
    ];
    mockGetTmdbCollectionParts.mockResolvedValueOnce([
      makeResult({ tmdb_id: 11, title: "Star Wars" }),
      makeResult({ tmdb_id: 1891, title: "The Empire Strikes Back" }),
    ]);

    const result = await franchiseEngine(buildContext(library, new Set()));

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("franchise");
    expect(result[0].reason).toBe("Complete Star Wars Collection");
    expect(result[0].recommendations).toHaveLength(1);
    expect(result[0].recommendations[0]).toMatchObject({
      tmdb_id: 1891,
      title: "The Empire Strikes Back",
      trace: {
        engine: "franchise",
        source: "live_tmdb",
        seedKind: "franchise",
        seedId: 10,
        seedName: "Star Wars Collection",
      },
    });
  });

  it("respects dismissed and title-duplicate filters", async () => {
    const library = [
      makeMovie({
        id: 1,
        title: "Alien",
        tmdb_id: 348,
        tmdb_collection_id: 8091,
        tmdb_collection_name: "Alien Collection",
      }),
      makeMovie({ id: 2, title: "Aliens", tmdb_id: null }),
    ];
    mockGetTmdbCollectionParts.mockResolvedValueOnce([
      makeResult({ tmdb_id: 679, title: "Aliens" }),
      makeResult({ tmdb_id: 8077, title: "Alien 3" }),
      makeResult({ tmdb_id: 8078, title: "Alien Resurrection" }),
    ]);

    const result = await franchiseEngine(buildContext(library, new Set([8077])));
    const titles = result.flatMap((group) =>
      group.recommendations.map((recommendation) => recommendation.title),
    );

    expect(titles).toEqual(["Alien Resurrection"]);
  });

  it("fetches collection parts sequentially and continues after one collection fails", async () => {
    const first = deferred<TmdbSearchResult[]>();
    const second = deferred<TmdbSearchResult[]>();
    const third = deferred<TmdbSearchResult[]>();
    const responses = new Map([
      [10, first.promise],
      [20, second.promise],
      [30, third.promise],
    ]);
    mockGetTmdbCollectionParts.mockImplementation((collectionId: number) => {
      const response = responses.get(collectionId);
      if (!response) throw new Error(`Unexpected collection ${collectionId}`);
      return response;
    });

    const library = [
      makeMovie({
        id: 1,
        title: "Star Wars",
        tmdb_id: 11,
        tmdb_collection_id: 10,
        tmdb_collection_name: "Star Wars Collection",
      }),
      makeMovie({
        id: 2,
        title: "Alien",
        tmdb_id: 348,
        tmdb_collection_id: 20,
        tmdb_collection_name: "Alien Collection",
      }),
      makeMovie({
        id: 3,
        title: "Mission: Impossible",
        tmdb_id: 954,
        tmdb_collection_id: 30,
        tmdb_collection_name: "Mission: Impossible Collection",
      }),
    ];

    const resultPromise = franchiseEngine(buildContext(library, new Set()));

    expect(mockGetTmdbCollectionParts).toHaveBeenCalledTimes(1);
    expect(mockGetTmdbCollectionParts).toHaveBeenNthCalledWith(1, 10);

    first.resolve([makeResult({ tmdb_id: 11, title: "Star Wars" })]);
    await flushMicrotasks();
    expect(mockGetTmdbCollectionParts).toHaveBeenCalledTimes(2);
    expect(mockGetTmdbCollectionParts).toHaveBeenNthCalledWith(2, 20);

    second.reject(new Error("TMDb collection failed"));
    await flushMicrotasks();
    expect(mockGetTmdbCollectionParts).toHaveBeenCalledTimes(3);
    expect(mockGetTmdbCollectionParts).toHaveBeenNthCalledWith(3, 30);

    third.resolve([
      makeResult({ tmdb_id: 955, title: "Mission: Impossible II" }),
    ]);

    const result = await resultPromise;
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("Complete Mission: Impossible Collection");
    expect(result[0].recommendations).toHaveLength(1);
    expect(result[0].recommendations[0].title).toBe("Mission: Impossible II");
  });
});
