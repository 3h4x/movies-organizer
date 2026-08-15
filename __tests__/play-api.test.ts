// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";
import { _resetForTests, _setBucketConfigForTests } from "@/lib/rate-limit";

const { mockAccess, mockExecFile } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockExecFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: { access: mockAccess },
  access: mockAccess,
}));

vi.mock("child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("util")>();
  return {
    ...actual,
    promisify: vi.fn((fn: unknown) => {
      if (fn === mockExecFile) {
        return vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
      }
      return actual.promisify(fn as never);
    }),
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST } from "@/app/api/movies/[id]/play/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-play-api.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function postReq(id: number, body: Record<string, unknown> = {}) {
  return new NextRequest(`http://localhost/api/movies/${id}/play`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("movies/[id]/play POST handler", () => {
  let db: Database.Database;
  let movieId: number;
  let movieWithFileId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

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

    movieWithFileId = insertMovie(db, {
      title: "The Matrix",
      year: 1999,
      genre: "Sci-Fi",
      director: "The Wachowskis",
      rating: 8.7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 603,
      type: "movie",
      file_path: "/movies/Matrix/The.Matrix.1999.mkv",
    });
  });

  afterEach(() => {
    db.close();
    _resetForTests();
    delete process.env.RATE_LIMIT_ENFORCE_IN_TESTS;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      fs.unlinkSync(TEST_DB);
    } catch {}
    vi.resetAllMocks();
  });

  it("returns 404 for non-existent movie", async () => {
    const res = await POST(postReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when movie has no file_path", async () => {
    const res = await POST(postReq(movieId, { action: "play" }), makeParams(movieId));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 with FILE_NOT_FOUND when file does not exist on disk", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));
    const res = await POST(postReq(movieWithFileId, { action: "play" }), makeParams(movieWithFileId));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("FILE_NOT_FOUND");
  });

  it("returns 400 for invalid action", async () => {
    mockAccess.mockResolvedValue(undefined);
    const res = await POST(postReq(movieWithFileId, { action: "invalid" }), makeParams(movieWithFileId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid action/i);
  });

  it("plays movie successfully with play action", async () => {
    mockAccess.mockResolvedValue(undefined);
    const res = await POST(postReq(movieWithFileId, { action: "play" }), makeParams(movieWithFileId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/playing/i);
  });

  it("opens folder with folder action", async () => {
    mockAccess.mockResolvedValue(undefined);
    const res = await POST(postReq(movieWithFileId, { action: "folder" }), makeParams(movieWithFileId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/folder/i);
  });

  it("defaults to play action when action not specified", async () => {
    mockAccess.mockResolvedValue(undefined);
    const res = await POST(postReq(movieWithFileId, {}), makeParams(movieWithFileId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("plays movie with extra files, opening all", async () => {
    db.prepare(
      "UPDATE movies SET extra_files = ? WHERE id = ?",
    ).run(JSON.stringify(["/movies/Matrix/The.Matrix.1999.part2.mkv"]), movieWithFileId);

    mockAccess.mockResolvedValue(undefined);
    const res = await POST(postReq(movieWithFileId, { action: "play" }), makeParams(movieWithFileId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 429 and does not launch anything when the mutation bucket is exhausted", async () => {
    process.env.RATE_LIMIT_ENFORCE_IN_TESTS = "1";
    _setBucketConfigForTests("mutation", { limit: 1, windowMs: 60_000 });
    mockAccess.mockResolvedValue(undefined);

    const firstRes = await POST(postReq(movieWithFileId, { action: "play" }), makeParams(movieWithFileId));
    expect(firstRes.status).toBe(200);

    const secondRes = await POST(postReq(movieWithFileId, { action: "folder" }), makeParams(movieWithFileId));
    expect(secondRes.status).toBe(429);
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });
});
