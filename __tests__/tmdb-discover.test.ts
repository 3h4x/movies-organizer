// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  discoverByGenre,
  discoverByPerson,
  discoverHiddenGems,
  discoverStarStudded,
  discoverRandom,
  discoverByMood,
  getTmdbMovieDetails,
  getMovieCredits,
  getMovieLocalized,
} from "@/lib/tmdb";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const rawMovie = (id: number, title: string) => ({
  id,
  title,
  release_date: "2020-01-01",
  genre_ids: [28, 18],
  vote_average: 7.5,
  poster_path: `/poster${id}.jpg`,
});

const expectMappedMovie = (result: { title: string; year: number | null; rating: number; tmdb_id: number; genre: string }) => {
  expect(result.year).toBe(2020);
  expect(result.rating).toBeCloseTo(7.5, 1);
  expect(result.genre).toContain("Action");
};

function okPage(movies: ReturnType<typeof rawMovie>[]) {
  return {
    ok: true,
    json: async () => ({ results: movies }),
  };
}

describe("discoverByGenre", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("fetches 3 pages and aggregates results", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(1, "Movie A")]))
      .mockResolvedValueOnce(okPage([rawMovie(2, "Movie B")]))
      .mockResolvedValueOnce(okPage([rawMovie(3, "Movie C")]));

    const results = await discoverByGenre(28);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.title)).toEqual(["Movie A", "Movie B", "Movie C"]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("with_genres=28"),
      expect.any(Object),
    );
    expectMappedMovie(results[0]);
  });

  it("stops fetching after a non-ok response", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(1, "Movie A")]))
      .mockResolvedValueOnce({ ok: false, status: 429 });

    const results = await discoverByGenre(28);

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("respects custom pages parameter", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(1, "Movie A")]))
      .mockResolvedValueOnce(okPage([rawMovie(2, "Movie B")]));

    const results = await discoverByGenre(35, 2);

    expect(results).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("with_genres=35"),
      expect.any(Object),
    );
  });

  it("returns empty array when first page fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const results = await discoverByGenre(28);
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("discoverByPerson", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("fetches 2 pages by default and uses with_people param", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(10, "Person Film 1")]))
      .mockResolvedValueOnce(okPage([rawMovie(11, "Person Film 2")]));

    const results = await discoverByPerson(12345);

    expect(results).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("with_people=12345"),
      expect.any(Object),
    );
  });
});

describe("discoverHiddenGems", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("fetches 3 pages with hidden gem parameters", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(20, "Hidden A")]))
      .mockResolvedValueOnce(okPage([rawMovie(21, "Hidden B")]))
      .mockResolvedValueOnce(okPage([rawMovie(22, "Hidden C")]));

    const results = await discoverHiddenGems();

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Each URL should include the hidden gem constraints
    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("vote_count.gte=50");
    expect(firstUrl).toContain("vote_average.gte=7.5");
  });

  it("appends genre filter when genreId is provided", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverHiddenGems(27);

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("with_genres=27");
  });

  it("does not append genre filter when genreId is omitted", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverHiddenGems();

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).not.toContain("with_genres");
  });
});

describe("discoverStarStudded", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("fetches 3 sequential pages with popularity sort", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(30, "Blockbuster A")]))
      .mockResolvedValueOnce(okPage([rawMovie(31, "Blockbuster B")]))
      .mockResolvedValueOnce(okPage([rawMovie(32, "Blockbuster C")]));

    const results = await discoverStarStudded();

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("sort_by=popularity.desc");
    expect(firstUrl).toContain("vote_count.gte=5000");
    expect(firstUrl).toContain("page=1");
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toContain("page=2");
  });
});

describe("discoverRandom", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("fetches 3 pages and returns shuffled results", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(40, "Random A")]))
      .mockResolvedValueOnce(okPage([rawMovie(41, "Random B")]))
      .mockResolvedValueOnce(okPage([rawMovie(42, "Random C")]));

    const results = await discoverRandom();

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("vote_average.gte=6.5");
  });
});

describe("discoverByMood", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("fetches 3 pages by default and returns aggregated results", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(1, "Comedy A")]))
      .mockResolvedValueOnce(okPage([rawMovie(2, "Comedy B")]))
      .mockResolvedValueOnce(okPage([rawMovie(3, "Comedy C")]));

    const results = await discoverByMood({ genreIds: [35], minRating: 6.5, minVotes: 200 });

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("includes with_genres in URL when genreIds provided", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverByMood({ genreIds: [35, 10751] });

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("with_genres=35,10751");
  });

  it("does not include with_genres in URL when genreIds is omitted", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverByMood({ languages: ["fr"] });

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).not.toContain("with_genres");
  });

  it("applies minRating and minVotes to URL", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverByMood({ minRating: 7.5, minVotes: 500 });

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("vote_average.gte=7.5");
    expect(firstUrl).toContain("vote_count.gte=500");
  });

  it("uses default minRating=6.5 and minVotes=200 when not specified", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverByMood({});

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("vote_average.gte=6.5");
    expect(firstUrl).toContain("vote_count.gte=200");
  });

  it("appends with_runtime.lte when maxRuntime is provided", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverByMood({ maxRuntime: 100 });

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("with_runtime.lte=100");
  });

  it("does not append with_runtime.lte when maxRuntime is omitted", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverByMood({});

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).not.toContain("with_runtime");
  });

  it("fetches separate pages per language and aggregates all results", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(10, "French Film")]))
      .mockResolvedValueOnce(okPage([rawMovie(11, "French Film 2")]))
      .mockResolvedValueOnce(okPage([rawMovie(12, "French Film 3")]))
      .mockResolvedValueOnce(okPage([rawMovie(20, "Japanese Film")]))
      .mockResolvedValueOnce(okPage([rawMovie(21, "Japanese Film 2")]))
      .mockResolvedValueOnce(okPage([rawMovie(22, "Japanese Film 3")]));

    const results = await discoverByMood({ languages: ["fr", "ja"], pages: 3 });

    expect(results).toHaveLength(6);
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it("adds with_original_language to URL for each language", async () => {
    mockFetch.mockResolvedValue(okPage([]));

    await discoverByMood({ languages: ["ko"], pages: 1 });

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("with_original_language=ko");
  });

  it("respects custom pages parameter", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(1, "Film 1")]))
      .mockResolvedValueOnce(okPage([rawMovie(2, "Film 2")]));

    const results = await discoverByMood({ pages: 2 });

    expect(results).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops fetching after a non-ok response", async () => {
    mockFetch
      .mockResolvedValueOnce(okPage([rawMovie(1, "Film A")]))
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(okPage([rawMovie(3, "Film C")]));

    const results = await discoverByMood({});

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when first page fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const results = await discoverByMood({ genreIds: [28] });
    expect(results).toEqual([]);
  });
});

describe("getTmdbMovieDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("extracts director, writer, and top 5 actors from credits", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [
            { id: 1, name: "Christopher Nolan", job: "Director" },
            { id: 2, name: "Jonathan Nolan", job: "Screenplay" },
            { id: 3, name: "David Goyer", job: "Story" },
            { id: 4, name: "Emma Thomas", job: "Producer" },
          ],
          cast: [
            { id: 10, name: "Christian Bale", character: "Bruce Wayne" },
            { id: 11, name: "Heath Ledger", character: "Joker" },
            { id: 12, name: "Aaron Eckhart", character: "Harvey Dent" },
            { id: 13, name: "Maggie Gyllenhaal", character: "Rachel" },
            { id: 14, name: "Gary Oldman", character: "Gordon" },
            { id: 15, name: "Morgan Freeman", character: "Fox" }, // 6th — should be excluded
          ],
        },
      }),
    });

    const details = await getTmdbMovieDetails(155);

    expect(details.director).toBe("Christopher Nolan");
    expect(details.writer).toBe("Jonathan Nolan, David Goyer");
    expect(details.actors).toBe(
      "Christian Bale, Heath Ledger, Aaron Eckhart, Maggie Gyllenhaal, Gary Oldman",
    );
    expect(details.actors).not.toContain("Morgan Freeman");
  });

  it("returns nulls when crew/cast are absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ credits: {} }),
    });

    const details = await getTmdbMovieDetails(999);

    expect(details.director).toBeNull();
    expect(details.writer).toBeNull();
    expect(details.actors).toBeNull();
  });

  it("returns nulls on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const details = await getTmdbMovieDetails(0);

    expect(details).toEqual({ director: null, writer: null, actors: null });
  });

  it("excludes non-writing crew roles from writer field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [
            { id: 1, name: "A Director", job: "Director" },
            { id: 2, name: "A Producer", job: "Producer" },
            { id: 3, name: "A Writer", job: "Writer" },
          ],
          cast: [],
        },
      }),
    });

    const details = await getTmdbMovieDetails(1);
    expect(details.writer).toBe("A Writer");
  });
});

describe("getMovieCredits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns typed directors and top-5 cast", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        crew: [
          { id: 1, name: "Denis Villeneuve", job: "Director" },
          { id: 2, name: "Some Editor", job: "Editor" },
        ],
        cast: [
          { id: 10, name: "Actor One", character: "Hero" },
          { id: 11, name: "Actor Two", character: "Sidekick" },
          { id: 12, name: "Actor Three", character: "Villain" },
          { id: 13, name: "Actor Four", character: "Mentor" },
          { id: 14, name: "Actor Five", character: "Support" },
          { id: 15, name: "Actor Six", character: "Extra" }, // should be excluded
        ],
      }),
    });

    const credits = await getMovieCredits(438631);

    expect(credits.directors).toHaveLength(1);
    expect(credits.directors[0]).toEqual({
      id: 1,
      name: "Denis Villeneuve",
      job: "Director",
    });
    expect(credits.cast).toHaveLength(5);
    expect(credits.cast[0]).toEqual({
      id: 10,
      name: "Actor One",
      character: "Hero",
    });
    expect(credits.cast.map((c) => c.name)).not.toContain("Actor Six");
  });

  it("returns empty arrays on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const credits = await getMovieCredits(0);
    expect(credits).toEqual({ directors: [], cast: [] });
  });
});

describe("getMovieLocalized", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns Polish title and description", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Incepcja",
        overview: "Złodziej który kradnie sekrety.",
      }),
    });

    const result = await getMovieLocalized(27205);
    expect(result.pl_title).toBe("Incepcja");
    expect(result.description).toBe("Złodziej który kradnie sekrety.");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("language=pl-PL"),
      expect.any(Object),
    );
  });

  it("returns nulls on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await getMovieLocalized(0);
    expect(result).toEqual({ pl_title: null, description: null });
  });
});
