import {
  getSubtitleContextKey,
  upsertSubtitleTrack,
} from "@/components/movie-detail/useMovieSubtitles";
import { describe, expect, it } from "vitest";

describe("upsertSubtitleTrack", () => {
  const srt = { name: "Inception.srt", path: "/movies/Inception/Inception.srt" };
  const ass = { name: "Inception.ass", path: "/movies/Inception/Inception.ass" };

  it("appends a track that is not in the list yet", () => {
    expect(upsertSubtitleTrack([], srt)).toEqual([srt]);
    expect(upsertSubtitleTrack([srt], ass)).toEqual([srt, ass]);
  });

  it("replaces a re-uploaded track instead of listing it twice", () => {
    // The server overwrites the same path, so the list must not grow.
    const reuploaded = { name: "Inception.srt", path: srt.path };
    expect(upsertSubtitleTrack([srt], reuploaded)).toEqual([reuploaded]);
  });

  it("keeps the replaced track in its original position", () => {
    // Index-based React keys mean reordering would remount the <track> element.
    const reuploaded = { name: "Inception.srt", path: srt.path };
    expect(upsertSubtitleTrack([srt, ass], reuploaded)).toEqual([
      reuploaded,
      ass,
    ]);
  });
});

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
