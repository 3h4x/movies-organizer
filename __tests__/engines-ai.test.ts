import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  aiEngine,
  buildAiPrompt,
  buildAiTasteProfile,
  callAnthropicRecommendations,
  getAiProfileHash,
  parseAiResponse,
} from "@/lib/engines/ai";
import type { EngineContext, RecConfig } from "@/lib/engines";
import type { Movie } from "@/lib/db";
import type { TmdbSearchResult } from "@/lib/tmdb";

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

function movie(overrides: Partial<Movie> & { id: number; title: string }): Movie {
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    year: 2020,
    genre: "Drama",
    director: null,
    writer: null,
    actors: null,
    rating: 7,
    user_rating: null,
    poster_url: null,
    source: "tmdb",
    imdb_id: null,
    tmdb_id: overrides.id,
    type: "movie",
    file_path: null,
    extra_files: null,
    created_at: "2026-01-01",
    rated_at: null,
    ...rest,
  };
}

function candidate(overrides: Partial<TmdbSearchResult> & { tmdb_id: number; title: string }): TmdbSearchResult {
  return {
    year: 2021,
    genre: "Drama",
    rating: 8,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

function context(library: Movie[] = [], config?: RecConfig): EngineContext {
  return {
    library,
    dismissedIds: new Set<number>(),
    libraryTmdbIds: new Set(library.map((item) => item.tmdb_id).filter(Boolean) as number[]),
    libraryTitles: new Set(library.map((item) => item.title.toLowerCase())),
    config,
  };
}

describe("AI recommendation engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    vi.unstubAllGlobals();
  });

  it("builds a compact taste profile from ratings, people, genres, wishlist, and dismissals", () => {
    const profile = JSON.parse(
      buildAiTasteProfile(
        [
          movie({
            id: 1,
            title: "Arrival",
            genre: "Sci-Fi, Drama",
            director: "Denis Villeneuve",
            actors: "Amy Adams, Jeremy Renner",
            user_rating: 9,
            rated_at: "2026-02-01",
          }),
          movie({
            id: 2,
            title: "Heat",
            genre: "Crime, Drama",
            director: "Michael Mann",
            actors: "Al Pacino, Robert De Niro",
            user_rating: 8,
            wishlist: 1,
          }),
        ],
        new Set([44, 99]),
      ),
    );

    expect(profile.top_rated[0].title).toBe("Arrival");
    expect(profile.top_genres[0].name).toBe("Drama");
    expect(profile.top_directors.map((entry: { name: string }) => entry.name)).toContain("Denis Villeneuve");
    expect(profile.top_actors.map((entry: { name: string }) => entry.name)).toContain("Amy Adams");
    expect(profile.wishlist[0].title).toBe("Heat");
    expect(profile.dismissed_tmdb_ids).toEqual([44, 99]);
  });

  it("uses a stable profile hash for equivalent context", () => {
    const ctx = context([
      movie({ id: 1, title: "Arrival", user_rating: 9 }),
      movie({ id: 2, title: "Heat", user_rating: 8 }),
    ]);

    expect(getAiProfileHash(ctx)).toBe(getAiProfileHash(ctx));
  });

  it("includes effective recommendation filters in the profile hash", () => {
    const library = [
      movie({ id: 1, title: "Arrival", user_rating: 9 }),
      movie({ id: 2, title: "Heat", user_rating: 8 }),
    ];
    const baseConfig: RecConfig = {
      excluded_genres: ["Horror", "Comedy"],
      min_year: 1990,
      min_rating: 7,
      max_per_group: 15,
    };
    const reorderedConfig: RecConfig = {
      ...baseConfig,
      excluded_genres: ["comedy", "Horror"],
    };
    const changedMinYearConfig: RecConfig = {
      ...baseConfig,
      min_year: 2000,
    };
    const changedMinRatingConfig: RecConfig = {
      ...baseConfig,
      min_rating: 8,
    };
    const changedExcludedGenresConfig: RecConfig = {
      ...baseConfig,
      excluded_genres: ["Drama"],
    };

    expect(getAiProfileHash(context(library, baseConfig))).toBe(
      getAiProfileHash(context(library, reorderedConfig)),
    );
    expect(getAiProfileHash(context(library, baseConfig))).not.toBe(
      getAiProfileHash(context(library, changedMinYearConfig)),
    );
    expect(getAiProfileHash(context(library, baseConfig))).not.toBe(
      getAiProfileHash(context(library, changedMinRatingConfig)),
    );
    expect(getAiProfileHash(context(library, baseConfig))).not.toBe(
      getAiProfileHash(context(library, changedExcludedGenresConfig)),
    );
  });

  it("marks the taste profile block for Anthropic prompt caching", () => {
    const prompt = buildAiPrompt("{}", [
      candidate({ tmdb_id: 10, title: "Aftersun" }),
    ]);

    expect(prompt.system[1]).toMatchObject({
      cache_control: { type: "ephemeral" },
    });
    expect(prompt.user).toContain("Aftersun");
  });

  it("parses valid picks and rejects malformed or out-of-pool entries", () => {
    const picks = parseAiResponse(
      JSON.stringify([
        { tmdb_id: 1, score: 91, reason: "Matches your patient sci-fi dramas." },
        { tmdb_id: 2, score: 200, reason: "Fits your crime favorites." },
        { tmdb_id: 3, score: 80, reason: "Not allowed." },
        { tmdb_id: 1, score: 10, reason: "Duplicate." },
        { tmdb_id: 2, score: 10, reason: "" },
      ]),
      new Set([1, 2]),
    );

    expect(picks).toEqual([
      { tmdb_id: 1, score: 91, reason: "Matches your patient sci-fi dramas." },
      { tmdb_id: 2, score: 100, reason: "Fits your crime favorites." },
    ]);
  });

  it("calls Anthropic with the cached profile prompt and parses text JSON", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify([
                { tmdb_id: 10, score: 88, reason: "Extends your taste for quiet dramas." },
              ]),
            },
          ],
          usage: {
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 25,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const picks = await callAnthropicRecommendations(
      "{}",
      [candidate({ tmdb_id: 10, title: "Aftersun" })],
      "test-key",
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = JSON.parse(init.body as string);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.model).toBe("claude-haiku-4-5-20251001");
    expect(request.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(picks[0].reason).toBe("Extends your taste for quiet dramas.");
  });

  it("returns no groups and does not fetch when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(aiEngine(context())).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
