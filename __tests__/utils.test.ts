// tamtam inspected 2026-05-21
import { describe, it, expect } from "vitest";
import { cleanTitle, parseFilename, getErrorMessage, getRatedMovieTmdbIds, filterRatedRecommendations, deduplicateRecommendations, getUniqueRecommendations } from "@/lib/utils";
import type { Movie, RecommendationGroup, RecType } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

function makeRec(tmdb_id: number, title = `Film ${tmdb_id}`): TmdbSearchResult {
  return { tmdb_id, title, year: 2020, genre: "Drama", rating: 7.0, poster_url: null, imdb_id: null };
}

function makeGroup(type: RecType, recs: TmdbSearchResult[]): RecommendationGroup {
  return { type, reason: `${type} picks`, recommendations: recs };
}

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

describe("cleanTitle", () => {
  it("removes file extension", () => {
    expect(cleanTitle("Inception.mkv")).toBe("Inception");
    expect(cleanTitle("The.Shining.avi")).toBe("The Shining");
  });

  it("removes bracketed content", () => {
    expect(cleanTitle("Inception [2010]")).toBe("Inception");
    expect(cleanTitle("Movie [BluRay][1080p]")).toBe("Movie");
  });

  it("removes curly-brace content", () => {
    expect(cleanTitle("Movie {HDR}")).toBe("Movie");
  });

  it("removes quality/codec tags", () => {
    expect(cleanTitle("Movie.720p")).toBe("Movie");
    expect(cleanTitle("Movie.1080p.BluRay.x264")).toBe("Movie");
    expect(cleanTitle("Movie.2160p.UHD.HEVC.AC3")).toBe("Movie");
    expect(cleanTitle("Movie.BDRip.xvid.DTS")).toBe("Movie");
  });

  it("removes source tags", () => {
    expect(cleanTitle("Movie.WEBRIP.x265")).toBe("Movie");
    expect(cleanTitle("Movie.WEB-DL.AAC")).toBe("Movie");
    expect(cleanTitle("Movie.HDTV.DVDRip")).toBe("Movie");
  });

  it("replaces underscores with spaces", () => {
    expect(cleanTitle("The_Godfather")).toBe("The Godfather");
  });

  it("replaces dots with spaces (trailing segment treated as extension)", () => {
    // cleanTitle is designed for video filenames: the last dot-segment is
    // stripped as an extension before dots become spaces.
    // "The.Dark.Knight" → remove ".Knight" → "The Dark"
    expect(cleanTitle("The.Dark.Knight")).toBe("The Dark");
    // With an explicit extension present, the title is preserved
    expect(cleanTitle("The.Dark.Knight.2008.mkv")).toContain("Dark Knight");
  });

  it("collapses multiple spaces", () => {
    expect(cleanTitle("Movie   Title")).toBe("Movie Title");
  });

  it("trims trailing whitespace and punctuation", () => {
    expect(cleanTitle("Inception  ")).toBe("Inception");
    expect(cleanTitle("Inception-")).toBe("Inception");
  });

  it("removes release group tags", () => {
    expect(cleanTitle("Movie.YIFY")).toBe("Movie");
    expect(cleanTitle("Movie.FGT")).toBe("Movie");
    expect(cleanTitle("Movie.YTS")).toBe("Movie");
  });

  it("removes locale/language tags", () => {
    expect(cleanTitle("Movie.PL.Multi.Subs")).toBe("Movie");
    expect(cleanTitle("Movie.English.Polish")).toBe("Movie");
  });

  it("removes www/domain tags", () => {
    expect(cleanTitle("Movie.www.com")).toBe("Movie");
  });

  it("handles a realistic noisy filename", () => {
    const result = cleanTitle(
      "The.Thing.1982.BluRay.720p.x264.YIFY.mkv",
    );
    // Should contain "Thing" with year and noise stripped
    expect(result).toContain("Thing");
    expect(result).not.toContain("720p");
    expect(result).not.toContain("YIFY");
    expect(result).not.toContain(".mkv");
  });

  it("handles already-clean titles without mangling", () => {
    expect(cleanTitle("Inception")).toBe("Inception");
    expect(cleanTitle("The Dark Knight")).toBe("The Dark Knight");
  });

  it("handles empty string", () => {
    expect(cleanTitle("")).toBe("");
  });

  it("preserves numeric-heavy titles that are not years", () => {
    // "1917" is a movie title that should survive cleanTitle
    const result = cleanTitle("1917");
    expect(result).toBe("1917");
  });

  it("handles multi-part tags like cd1/cd2", () => {
    expect(cleanTitle("Movie.CD1.avi")).toBe("Movie");
    expect(cleanTitle("Movie.CD2.mkv")).toBe("Movie");
  });
});

describe("parseFilename", () => {
  it("parses title and year from parenthesized year", () => {
    const { title, year } = parseFilename("Inception (2010).mkv");
    expect(title).toBe("Inception");
    expect(year).toBe(2010);
  });

  it("parses year from bracketed year", () => {
    const { title, year } = parseFilename("The Matrix [1999].mkv");
    expect(title).toBe("The Matrix");
    expect(year).toBe(1999);
  });

  it("parses year from leading parenthesized format", () => {
    const { title, year } = parseFilename("(2013) Gravity.mkv");
    expect(title).toBe("Gravity");
    expect(year).toBe(2013);
  });

  it("parses year from dot-separated filename", () => {
    const { title, year } = parseFilename("Dune.2021.mkv");
    expect(title).toBe("Dune");
    expect(year).toBe(2021);
  });

  it("parses year from noisy release filename", () => {
    const { title, year } = parseFilename("Interstellar.2014.1080p.BluRay.x264.mkv");
    expect(title).toContain("Interstellar");
    expect(year).toBe(2014);
  });

  it("returns null year when no year is found", () => {
    const { title, year } = parseFilename("Casablanca.mkv");
    expect(title).toBe("Casablanca");
    expect(year).toBeNull();
  });

  it("treats a standalone 4-digit number as a year, leaving an empty title", () => {
    // "1917.mkv" has no text before the year, so year=1917, title=""
    const { title, year } = parseFilename("1917.mkv");
    expect(year).toBe(1917);
    expect(title).toBe("");
  });

  it("handles underscore-separated filename", () => {
    const { title, year } = parseFilename("The_Godfather_1972.mkv");
    expect(title).toContain("Godfather");
    expect(year).toBe(1972);
  });

  it("strips release tags from title", () => {
    const { title } = parseFilename("Blade.Runner.1982.REMASTERED.1080p.BluRay.mkv");
    expect(title).toContain("Blade");
    expect(title).not.toContain("1080p");
    expect(title).not.toContain("BluRay");
  });

  it("returns empty string for filename with only release tags", () => {
    const { title } = parseFilename("1080p.BluRay.x264.mkv");
    expect(typeof title).toBe("string");
  });

  it("ignores years below 1900 in parentheses", () => {
    const { year, title } = parseFilename("Movie (1899).mkv");
    expect(year).toBeNull();
    expect(title).toContain("Movie");
  });

  it("ignores years above 2099 in parentheses", () => {
    const { year } = parseFilename("Movie (2100).mkv");
    expect(year).toBeNull();
  });

  it("ignores years below 1900 in brackets", () => {
    const { year } = parseFilename("Movie [1750].mkv");
    expect(year).toBeNull();
  });

  it("ignores years above 2099 in brackets", () => {
    const { year } = parseFilename("Movie [2150].mkv");
    expect(year).toBeNull();
  });

  it("ignores out-of-range bare years", () => {
    const { year } = parseFilename("Movie.1850.1080p.mkv");
    expect(year).toBeNull();
  });

  it("does not extract bare year when not followed by known tag or end", () => {
    // "Nothing" after 1987 is not a known release tag, so year should not be extracted
    const { year } = parseFilename("One.1987.Nothing.mkv");
    expect(year).toBeNull();
  });
});

describe("getErrorMessage", () => {
  it("returns the message property of an Error object", () => {
    const err = new Error("something went wrong");
    expect(getErrorMessage(err)).toBe("something went wrong");
  });

  it("converts a plain string to a string", () => {
    expect(getErrorMessage("oops")).toBe("oops");
  });

  it("converts a number to a string", () => {
    expect(getErrorMessage(404)).toBe("404");
  });

  it("converts null to string", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("converts undefined to string", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("converts an object to its string representation", () => {
    expect(getErrorMessage({ code: 1 })).toBe("[object Object]");
  });
});

describe("filterRatedRecommendations", () => {
  it("filters out rated movies from recommendations", () => {
    const groups = [makeGroup("genre", [makeRec(1), makeRec(2)])];
    const rated = new Set<number | null | undefined>([1]);
    const result = filterRatedRecommendations(groups, rated);
    expect(result[0].recommendations).toHaveLength(1);
    expect(result[0].recommendations[0].tmdb_id).toBe(2);
  });

  it("removes entire group when all recommendations are rated", () => {
    const groups = [makeGroup("genre", [makeRec(1)])];
    const rated = new Set<number | null | undefined>([1]);
    expect(filterRatedRecommendations(groups, rated)).toHaveLength(0);
  });

  it("returns all recommendations unchanged when skipFilter=true", () => {
    const groups = [makeGroup("genre", [makeRec(1), makeRec(2)])];
    const rated = new Set<number | null | undefined>([1, 2]);
    const result = filterRatedRecommendations(groups, rated, true);
    expect(result[0].recommendations).toHaveLength(2);
  });

  it("returns groups unchanged when rated set is empty", () => {
    const groups = [makeGroup("genre", [makeRec(1), makeRec(2)])];
    const result = filterRatedRecommendations(groups, new Set());
    expect(result[0].recommendations).toHaveLength(2);
  });

  it("returns empty array when input groups is empty", () => {
    expect(filterRatedRecommendations([], new Set([1]))).toEqual([]);
  });

  it("filters rated movies across multiple groups independently", () => {
    const groups = [
      makeGroup("genre", [makeRec(1), makeRec(2)]),
      makeGroup("director", [makeRec(3), makeRec(4)]),
    ];
    const rated = new Set<number | null | undefined>([1, 3]);
    const result = filterRatedRecommendations(groups, rated);
    expect(result).toHaveLength(2);
    expect(result[0].recommendations.map((r) => r.tmdb_id)).toEqual([2]);
    expect(result[1].recommendations.map((r) => r.tmdb_id)).toEqual([4]);
  });
});

describe("getRatedMovieTmdbIds", () => {
  it("includes rated movie tmdb ids", () => {
    const result = getRatedMovieTmdbIds([
      makeMovie({ tmdb_id: 10, user_rating: 8, type: "movie" }),
      makeMovie({ id: 2, tmdb_id: 20, user_rating: null, type: "movie" }),
    ]);
    expect(result.has(10)).toBe(true);
    expect(result.has(20)).toBe(false);
  });

  it("ignores rated tv rows with colliding tmdb ids", () => {
    const result = getRatedMovieTmdbIds([
      makeMovie({ tmdb_id: 10, user_rating: 9, type: "tv" }),
      makeMovie({ id: 2, tmdb_id: 11, user_rating: 8, type: "movie" }),
    ]);
    expect(result.has(10)).toBe(false);
    expect(result.has(11)).toBe(true);
  });
});

describe("deduplicateRecommendations", () => {
  it("removes duplicate tmdb_ids across groups", () => {
    const groups = [
      makeGroup("genre", [makeRec(1), makeRec(2)]),
      makeGroup("director", [makeRec(2), makeRec(3)]),
    ];
    const result = deduplicateRecommendations(groups);
    const allIds = result.flatMap((g) => g.recommendations.map((r) => r.tmdb_id));
    expect(allIds).toEqual([1, 2, 3]);
  });

  it("removes entire group when all its recommendations are already seen", () => {
    const groups = [
      makeGroup("genre", [makeRec(1)]),
      makeGroup("director", [makeRec(1)]),
    ];
    const result = deduplicateRecommendations(groups);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("genre");
  });

  it("deduplicates within a single group", () => {
    const groups = [makeGroup("genre", [makeRec(1), makeRec(1)])];
    const result = deduplicateRecommendations(groups);
    expect(result[0].recommendations).toHaveLength(1);
  });

  it("returns empty array when groups is empty", () => {
    expect(deduplicateRecommendations([])).toEqual([]);
  });

  it("leaves groups with no duplicates unchanged", () => {
    const groups = [
      makeGroup("genre", [makeRec(1), makeRec(2)]),
      makeGroup("director", [makeRec(3)]),
    ];
    const result = deduplicateRecommendations(groups);
    expect(result).toHaveLength(2);
    expect(result[0].recommendations).toHaveLength(2);
    expect(result[1].recommendations).toHaveLength(1);
  });
});

describe("getUniqueRecommendations", () => {
  it("preserves first-seen order across groups", () => {
    const groups = [
      makeGroup("genre", [makeRec(3), makeRec(1)]),
      makeGroup("director", [makeRec(1), makeRec(2)]),
    ];

    const result = getUniqueRecommendations(groups);

    expect(result.map((rec) => rec.tmdb_id)).toEqual([3, 1, 2]);
  });

  it("keeps the remaining order stable after a recommendation is removed", () => {
    const groups = [
      makeGroup("genre", [makeRec(10), makeRec(20), makeRec(30)]),
      makeGroup("director", [makeRec(20), makeRec(40)]),
    ];

    const originalOrder = getUniqueRecommendations(groups).map((rec) => rec.tmdb_id);
    const updatedGroups = groups.map((group) => ({
      ...group,
      recommendations: group.recommendations.filter((rec) => rec.tmdb_id !== 20),
    }));

    const updatedOrder = getUniqueRecommendations(updatedGroups).map((rec) => rec.tmdb_id);

    expect(originalOrder).toEqual([10, 20, 30, 40]);
    expect(updatedOrder).toEqual([10, 30, 40]);
  });

  it("returns an empty array when there are no groups", () => {
    expect(getUniqueRecommendations([])).toEqual([]);
  });
});
