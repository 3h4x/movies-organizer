// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

// Hoist mock functions so they are shared between the vi.mock factory and tests.
const { mockReaddir, mockWriteFile, mockExistsSync } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockExistsSync: vi.fn(),
}));

// Mock async fs (fs/promises) used for readdir and writeFile.
// The handler does `import fs from "fs/promises"` (default import), so the
// mocked functions must live on `default`.
vi.mock("fs/promises", () => ({
  default: {
    readdir: mockReaddir,
    writeFile: mockWriteFile,
  },
  readdir: mockReaddir,
  writeFile: mockWriteFile,
}));

// Mock sync fs used for existsSync checks.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
    },
    existsSync: mockExistsSync,
  };
});

// The upload handler probes the movie's frame rate with ffprobe. There is no real
// video file here, so fail the probe and let the handler fall back to its default.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    execFile: (
      ..._args: [string, string[], object, (error: Error | null) => void]
    ) => {
      const callback = _args[_args.length - 1];
      if (typeof callback === "function") {
        callback(new Error("ffprobe unavailable in tests"));
      }
    },
  };
});

// Patch only getDb so the handler uses our test database.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET, POST } from "@/app/api/movies/[id]/subtitles/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-subtitles-api.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe("movies/[id]/subtitles GET handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns hasSubtitles: false when movie is not found", async () => {
    const req = new NextRequest("http://localhost/api/movies/99999/subtitles");
    const res = await GET(req, makeParams(99999));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasSubtitles).toBe(false);
  });

  it("returns hasSubtitles: false when movie has no file_path", async () => {
    movieId = insertMovie(db, {
      title: "Test Movie",
      year: 2020,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    const req = new NextRequest(`http://localhost/api/movies/${movieId}/subtitles`);
    const res = await GET(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasSubtitles).toBe(false);
  });

  it("returns hasSubtitles: false with error when file does not exist on disk", async () => {
    movieId = insertMovie(db, {
      title: "Ghost Movie",
      year: 2020,
      genre: null,
      director: null,
      rating: null,
      poster_url: "/movies/Ghost Movie/Ghost Movie.mkv",
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/movies/Ghost Movie/Ghost Movie.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(false);

    const req = new NextRequest(`http://localhost/api/movies/${movieId}/subtitles`);
    const res = await GET(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasSubtitles).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });

  it("returns empty subtitles list when directory has no subtitle files", async () => {
    movieId = insertMovie(db, {
      title: "No Subs",
      year: 2021,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/movies/No Subs/No Subs.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue(["No Subs.mkv", "poster.jpg"]);

    const req = new NextRequest(`http://localhost/api/movies/${movieId}/subtitles`);
    const res = await GET(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasSubtitles).toBe(false);
    expect(body.subtitles).toEqual([]);
  });

  it("returns subtitle files that match the movie filename", async () => {
    movieId = insertMovie(db, {
      title: "Dune",
      year: 2021,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/movies/Dune [2021]/Dune.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue([
      "Dune.mkv",
      "Dune.srt",
      "Dune.en.srt",
      "other_movie.srt",
      "poster.jpg",
    ]);

    const req = new NextRequest(`http://localhost/api/movies/${movieId}/subtitles`);
    const res = await GET(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasSubtitles).toBe(true);
    expect(body.subtitles).toHaveLength(2);
    const names = body.subtitles.map((s: any) => s.name);
    expect(names).toContain("Dune.srt");
    expect(names).toContain("Dune.en.srt");
    expect(names).not.toContain("other_movie.srt");
  });

  it("returns hasSubtitles: false when readdir throws", async () => {
    movieId = insertMovie(db, {
      title: "Error Movie",
      year: 2022,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/movies/Error Movie/Error Movie.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockRejectedValue(new Error("EACCES: permission denied"));

    const req = new NextRequest(`http://localhost/api/movies/${movieId}/subtitles`);
    const res = await GET(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasSubtitles).toBe(false);
    expect(body.error).toMatch(/failed to read directory/i);
  });
});

describe("movies/[id]/subtitles POST handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    vi.clearAllMocks();

    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/movies/Inception [2010]/Inception.mkv",
      movieId,
    );
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  function makePostReq(id: number, file?: File): NextRequest {
    const formData = new FormData();
    if (file) formData.append("file", file);
    return new NextRequest(`http://localhost/api/movies/${id}/subtitles`, {
      method: "POST",
      body: formData,
    });
  }

  it("returns 404 when movie is not found", async () => {
    const file = new File(["subtitle content"], "movie.srt", { type: "text/plain" });
    const req = makePostReq(99999, file);
    const res = await POST(req, makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when movie has no file_path", async () => {
    const noPathId = insertMovie(db, {
      title: "No Path",
      year: 2020,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const file = new File(["subtitle content"], "movie.srt", { type: "text/plain" });
    const req = makePostReq(noPathId, file);
    const res = await POST(req, makeParams(noPathId));
    expect(res.status).toBe(404);
  });

  it("returns 404 when movie file does not exist on disk", async () => {
    mockExistsSync.mockReturnValue(false);
    const file = new File(["subtitle content"], "movie.srt", { type: "text/plain" });
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when no file is uploaded", async () => {
    mockExistsSync.mockReturnValue(true);
    const req = makePostReq(movieId); // no file appended
    const res = await POST(req, makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });

  it("returns 400 for an invalid subtitle extension", async () => {
    mockExistsSync.mockReturnValue(true);
    const file = new File(["content"], "movie.pdf", { type: "application/pdf" });
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid subtitle extension/i);
  });

  it("saves subtitle file with .srt extension matching the movie filename", async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);

    const file = new File(["1\n00:00:01,000 --> 00:00:02,000\nHello"], "movie.srt", {
      type: "text/plain",
    });
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fileName).toBe("Inception.srt");
    expect(body.path).toBe("/movies/Inception [2010]/Inception.srt");
  });

  it("keeps an .ass upload as .ass rather than mislabelling it SubRip", async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);

    const file = new File(["[Script Info]\nScriptType: v4.00+"], "movie.ass", {
      type: "text/plain",
    });
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileName).toBe("Inception.ass");
    expect(body.format).toBe("ass");
    expect(body.converted).toBe(false);
  });

  it("converts a MicroDVD payload that arrives named .srt", async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);

    // Exactly the trap that broke playback: MicroDVD frames under an .srt name.
    const file = new File(
      ["{1227}{1372}First line\r\n{1742}{1792}Second line"],
      "movie.srt",
      { type: "text/plain" },
    );
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("microdvd");
    expect(body.converted).toBe(true);
    expect(body.cueCount).toBe(2);
    expect(body.fileName).toBe("Inception.srt");

    // The bytes written must be real SubRip, not the original frame markers.
    const written = mockWriteFile.mock.calls.at(-1)?.[1] as Buffer;
    const text = written.toString("utf8");
    expect(text).toContain(" --> ");
    expect(text).not.toContain("{1227}");
  });

  it("converts a MicroDVD .txt upload and saves it as .srt", async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);

    const file = new File(["{100}{200}Hello"], "napisy.txt", {
      type: "text/plain",
    });
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("microdvd");
    expect(body.fileName).toBe("Inception.srt");
  });

  it("accepts a .vtt upload and converts it to SubRip", async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);

    const file = new File(
      ["WEBVTT\n\n00:00:51.176 --> 00:00:57.224\nHello\n"],
      "movie.vtt",
      { type: "text/vtt" },
    );
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("vtt");
    expect(body.converted).toBe(true);
    expect(body.fileName).toBe("Inception.srt");
  });

  it("keeps the uploaded extension when the content is unrecognisable", async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);

    const file = new File(["just some notes"], "movie.txt", {
      type: "text/plain",
    });
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("unknown");
    expect(body.fileName).toBe("Inception.txt");
  });

  it("returns 500 when writeFile throws", async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockRejectedValue(new Error("ENOSPC: no space left"));

    const file = new File(["content"], "movie.srt", { type: "text/plain" });
    const req = makePostReq(movieId, file);
    const res = await POST(req, makeParams(movieId));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/no space left/i);
  });
});
