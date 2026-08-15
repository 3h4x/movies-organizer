import { getSubtitleContextKey } from "@/components/movie-detail/useMovieSubtitles";
import { describe, expect, it } from "vitest";

describe("getSubtitleContextKey", () => {
  it("changes when a persisted movie keeps the same id but gets a different file path", () => {
    const before = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Old/Movie.mkv",
      isPersistedMovie: true,
    });
    const after = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/New/Movie.mkv",
      isPersistedMovie: true,
    });

    expect(after).not.toBe(before);
  });

  it("changes when a same-id movie loses its local file context", () => {
    const before = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Movie/Movie.mkv",
      isPersistedMovie: true,
    });
    const after = getSubtitleContextKey({
      movieId: 12,
      filePath: null,
      isPersistedMovie: true,
    });

    expect(after).not.toBe(before);
  });

  it("changes when the persisted state changes for the same id and path", () => {
    const before = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Movie/Movie.mkv",
      isPersistedMovie: true,
    });
    const after = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Movie/Movie.mkv",
      isPersistedMovie: false,
    });

    expect(after).not.toBe(before);
  });
});
