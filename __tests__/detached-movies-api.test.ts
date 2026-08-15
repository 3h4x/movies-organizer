// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getDetachedMovies } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET } from "@/app/api/movies/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-detached.db");

function makeReq(search = "") {
  return new NextRequest(`http://localhost/api/movies${search}`);
}

describe("getDetachedMovies", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns only rows with null file_path", () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("With File", 2020, "tmdb", "movie", "/some/path.mkv");
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Detached Null", 2021, "tmdb", "movie", null);
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Detached Empty", 2022, "tmdb", "movie", "");

    const detached = getDetachedMovies(db);
    expect(detached).toHaveLength(2);
    const titles = detached.map((m) => m.title);
    expect(titles).toContain("Detached Null");
    expect(titles).toContain("Detached Empty");
    expect(titles).not.toContain("With File");
  });

  it("returns rows ordered by title", () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Zebra", 2020, "tmdb", "movie", null);
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Alpha", 2021, "tmdb", "movie", null);
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Middle", 2022, "tmdb", "movie", null);

    const detached = getDetachedMovies(db);
    expect(detached.map((m) => m.title)).toEqual(["Alpha", "Middle", "Zebra"]);
  });

  it("returns empty array when all movies have file paths", () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Has File", 2020, "tmdb", "movie", "/video/movie.mkv");

    expect(getDetachedMovies(db)).toHaveLength(0);
  });

  it("includes user_rating, wishlist, tmdb_id, filmweb_id in returned rows", () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, user_rating, wishlist, tmdb_id, filmweb_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("Rich Row", 2021, "filmweb", "movie", null, 8, 1, 12345, 99);

    const detached = getDetachedMovies(db);
    expect(detached).toHaveLength(1);
    expect(detached[0].user_rating).toBe(8);
    expect(detached[0].wishlist).toBe(1);
    expect(detached[0].tmdb_id).toBe(12345);
    expect(detached[0].filmweb_id).toBe(99);
  });
});

describe("GET /api/movies?detached=1", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("returns only detached movies when detached=1", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Has File", 2020, "tmdb", "movie", "/path/to/file.mkv");
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("No File", 2021, "tmdb", "movie", null);

    const res = await GET(makeReq("?detached=1"));
    expect(res.status).toBe(200);
    const body = await res.json() as { title: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("No File");
  });

  it("returns all movies when detached param is absent", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("Has File", 2020, "tmdb", "movie", "/path/to/file.mkv");
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run("No File", 2021, "tmdb", "movie", null);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { title: string }[];
    expect(body).toHaveLength(2);
  });
});
