// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, insertMovie } from "@/lib/db";

const { mockStat, mockReadFile, mockCreateReadStream } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockReadFile: vi.fn(),
  mockCreateReadStream: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile,
  stat: mockStat,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      createReadStream: mockCreateReadStream,
      promises: { readFile: mockReadFile },
    },
    createReadStream: mockCreateReadStream,
    promises: { ...actual.promises, readFile: mockReadFile },
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET } from "@/app/api/movies/[id]/stream/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-stream-api.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function getReq(id: number, options: { range?: string; part?: number; sub?: string } = {}) {
  const url = new URL(`http://localhost/api/movies/${id}/stream`);
  if (options.part !== undefined) url.searchParams.set("part", String(options.part));
  if (options.sub) url.searchParams.set("sub", options.sub);
  const headers: Record<string, string> = {};
  if (options.range) headers["range"] = options.range;
  return new NextRequest(url.toString(), { headers });
}

const FAKE_STREAM = { pipe: vi.fn() };

describe("movies/[id]/stream GET handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db);
    mockCreateReadStream.mockReturnValue(FAKE_STREAM);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("returns 404 when movie does not exist", async () => {
    const res = await GET(getReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toMatch(/not found/i);
  });

  it("returns 404 when movie has no file_path", async () => {
    movieId = insertMovie(db, {
      title: "No File",
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
    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(404);
  });

  describe("with a movie that has file_path", () => {
    const FILE_PATH = "/movies/Inception/Inception.mp4";
    const FILE_SIZE = 1_000_000;

    beforeEach(() => {
      movieId = insertMovie(db, {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        director: "Christopher Nolan",
        rating: 8.8,
        poster_url: null,
        source: "tmdb",
        imdb_id: null,
        tmdb_id: 27205,
        type: "movie",
      });
      db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(FILE_PATH, movieId);
      mockStat.mockResolvedValue({ size: FILE_SIZE });
    });

    it("returns 200 with full file when no range header", async () => {
      const res = await GET(getReq(movieId), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/mp4");
      expect(res.headers.get("Content-Length")).toBe(String(FILE_SIZE));
      expect(mockCreateReadStream).toHaveBeenCalledWith(FILE_PATH);
    });

    it("returns video/x-matroska content type for .mkv files", async () => {
      db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
        "/movies/Inception/Inception.mkv",
        movieId,
      );
      const res = await GET(getReq(movieId), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/x-matroska");
    });

    it("returns 206 partial content for a range request", async () => {
      const res = await GET(getReq(movieId, { range: "bytes=0-99999" }), makeParams(movieId));
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe(`bytes 0-99999/${FILE_SIZE}`);
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res.headers.get("Content-Length")).toBe("100000");
      expect(mockCreateReadStream).toHaveBeenCalledWith(FILE_PATH, { start: 0, end: 99999 });
    });

    it("calculates end as file size - 1 when range end is omitted", async () => {
      const res = await GET(getReq(movieId, { range: "bytes=500000-" }), makeParams(movieId));
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe(
        `bytes 500000-${FILE_SIZE - 1}/${FILE_SIZE}`,
      );
    });

    it("returns 416 when range start is beyond file size", async () => {
      const res = await GET(
        getReq(movieId, { range: `bytes=${FILE_SIZE + 1}-` }),
        makeParams(movieId),
      );
      expect(res.status).toBe(416);
    });

    it("returns 404 when requesting a non-existent extra file part", async () => {
      const res = await GET(getReq(movieId, { part: 2 }), makeParams(movieId));
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toMatch(/part not found/i);
    });

    it("serves an extra file when part=1 and extra_files is set", async () => {
      const extra = "/movies/Inception/Inception.part2.mp4";
      db.prepare("UPDATE movies SET extra_files = ? WHERE id = ?").run(
        JSON.stringify([extra]),
        movieId,
      );
      const res = await GET(getReq(movieId, { part: 1 }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(mockCreateReadStream).toHaveBeenCalledWith(extra);
    });
  });

  describe("subtitle serving", () => {
    const FILE_PATH = "/movies/Dune/Dune.mp4";
    const SUB_DIR = "/movies/Dune";

    beforeEach(() => {
      movieId = insertMovie(db, {
        title: "Dune",
        year: 2021,
        genre: "Sci-Fi",
        director: "Denis Villeneuve",
        rating: 7.9,
        poster_url: null,
        source: "tmdb",
        imdb_id: null,
        tmdb_id: 438631,
        type: "movie",
      });
      db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(FILE_PATH, movieId);
    });

    it("serves a VTT subtitle file as-is", async () => {
      const vttContent = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello";
      mockReadFile.mockResolvedValue(vttContent);

      const res = await GET(getReq(movieId, { sub: "Dune.vtt" }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/vtt");
      expect(res.headers.get("Content-Disposition")).toBe("inline");
      const text = await res.text();
      expect(text).toBe(vttContent);
      expect(mockReadFile).toHaveBeenCalledWith(
        path.join(SUB_DIR, "Dune.vtt"),
        "utf-8",
      );
    });

    it("converts SRT to VTT format", async () => {
      const srtContent = "1\n00:00:01,000 --> 00:00:03,000\nHello world\n";
      mockReadFile.mockResolvedValue(srtContent);

      const res = await GET(getReq(movieId, { sub: "Dune.srt" }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/vtt");
      const text = await res.text();
      expect(text).toMatch(/^WEBVTT/);
      expect(text).toContain("00:00:01.000 --> 00:00:03.000");
    });

    it("returns 404 when subtitle file does not exist", async () => {
      mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const res = await GET(getReq(movieId, { sub: "missing.srt" }), makeParams(movieId));
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toMatch(/subtitle not found/i);
    });

    it("rejects path traversal via .. segments", async () => {
      const res = await GET(getReq(movieId, { sub: "../secret.txt" }), makeParams(movieId));
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toMatch(/invalid subtitle path/i);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("rejects deeply nested path traversal", async () => {
      const res = await GET(getReq(movieId, { sub: "../../etc/passwd" }), makeParams(movieId));
      expect(res.status).toBe(400);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("allows subtitle in a valid subdirectory", async () => {
      const vttContent = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nSub";
      mockReadFile.mockResolvedValue(vttContent);

      const res = await GET(getReq(movieId, { sub: "subs/Dune.vtt" }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(mockReadFile).toHaveBeenCalledWith(
        path.join(SUB_DIR, "subs/Dune.vtt"),
        "utf-8",
      );
    });
  });
});
