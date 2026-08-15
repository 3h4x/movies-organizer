// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getMovies } from "@/lib/db";
import type { Movie } from "@/lib/types";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET, POST } from "@/app/api/movies/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-movies-collection-api.db");

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/movies", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function getReq(params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params);
  const query = searchParams.toString();
  const url = query
    ? `http://localhost/api/movies?${query}`
    : "http://localhost/api/movies";
  return new NextRequest(url);
}

describe("GET /api/movies", () => {
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

  it("returns empty array when library is empty", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns all movies when no type filter is given", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Inception", 2010, "movie", "tmdb");
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Breaking Bad", 2008, "series", "tmdb");

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("filters by type=movie", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Inception", 2010, "movie", "tmdb");
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Breaking Bad", 2008, "series", "tmdb");

    const res = await GET(getReq({ type: "movie" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Inception");
  });

  it("filters by type=series", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Inception", 2010, "movie", "tmdb");
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Breaking Bad", 2008, "series", "tmdb");

    const res = await GET(getReq({ type: "series" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Breaking Bad");
  });

  it("searches the library with FTS prefix matching", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Inception", 2010, "movie", "tmdb");
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Interstellar", 2014, "movie", "tmdb");

    const res = await GET(getReq({ q: "incep" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((movie: Movie) => movie.title)).toEqual(["Inception"]);
  });

  it("searches director, writer, and actor fields", async () => {
    db.prepare(
      `INSERT INTO movies (title, year, type, source, director, writer, actors)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "Oppenheimer",
      2023,
      "movie",
      "tmdb",
      "Christopher Nolan",
      "Kai Bird, Martin Sherwin",
      "Cillian Murphy, Emily Blunt",
    );
    db.prepare(
      `INSERT INTO movies (title, year, type, source, director, writer, actors)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("Arrival", 2016, "movie", "tmdb", "Denis Villeneuve", null, "Amy Adams");

    const directorRes = await GET(getReq({ q: "villeneuve" }));
    const writerRes = await GET(getReq({ q: "sherwin" }));
    const actorRes = await GET(getReq({ q: "cillian" }));

    expect((await directorRes.json()).map((movie: Movie) => movie.title)).toEqual(["Arrival"]);
    expect((await writerRes.json()).map((movie: Movie) => movie.title)).toEqual(["Oppenheimer"]);
    expect((await actorRes.json()).map((movie: Movie) => movie.title)).toEqual(["Oppenheimer"]);
  });

  it("returns no movies for an FTS miss", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Inception", 2010, "movie", "tmdb");

    const res = await GET(getReq({ q: "notfound" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns no movies when an FTS query has no searchable tokens", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source) VALUES (?, ?, ?, ?)",
    ).run("Inception", 2010, "movie", "tmdb");

    const res = await GET(getReq({ q: "!!!" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("combines FTS search with type filtering", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source, actors) VALUES (?, ?, ?, ?, ?)",
    ).run("Twin Peaks", 1990, "series", "tmdb", "Kyle MacLachlan");
    db.prepare(
      "INSERT INTO movies (title, year, type, source, actors) VALUES (?, ?, ?, ?, ?)",
    ).run("Blue Velvet", 1986, "movie", "tmdb", "Kyle MacLachlan");

    const res = await GET(getReq({ q: "kyle", type: "series" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((movie: Movie) => movie.title)).toEqual(["Twin Peaks"]);
  });

  it("returns no movies when a typed FTS query has no searchable tokens", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, type, source, actors) VALUES (?, ?, ?, ?, ?)",
    ).run("Twin Peaks", 1990, "series", "tmdb", "Kyle MacLachlan");
    db.prepare(
      "INSERT INTO movies (title, year, type, source, actors) VALUES (?, ?, ?, ?, ?)",
    ).run("Blue Velvet", 1986, "movie", "tmdb", "Kyle MacLachlan");

    const res = await GET(getReq({ q: "!!!", type: "series" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /api/movies", () => {
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

  it("returns 400 when title is missing", async () => {
    const res = await POST(postReq({ year: 2010 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  it("creates a movie and returns 201 with id", async () => {
    const res = await POST(
      postReq({ title: "Inception", year: 2010, genre: "Sci-Fi", tmdb_id: 27205 }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeGreaterThan(0);

    const row = db.prepare("SELECT * FROM movies WHERE id = ?").get(body.id) as Movie;
    expect(row.title).toBe("Inception");
    expect(row.year).toBe(2010);
    expect(row.tmdb_id).toBe(27205);
  });

  it("defaults type to 'movie' when not provided", async () => {
    const res = await POST(postReq({ title: "Inception" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    const row = db.prepare("SELECT type FROM movies WHERE id = ?").get(body.id) as { type: string };
    expect(row.type).toBe("movie");
  });

  it("persists user_rating via extra UPDATE when provided", async () => {
    const res = await POST(postReq({ title: "Inception", user_rating: 9 }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT user_rating FROM movies WHERE id = ?").get(id) as { user_rating: number };
    expect(row.user_rating).toBe(9);
  });

  it("persists wishlist flag when provided", async () => {
    const res = await POST(postReq({ title: "Inception", wishlist: 1 }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT wishlist FROM movies WHERE id = ?").get(id) as { wishlist: number };
    expect(row.wishlist).toBe(1);
  });

  it("persists cda_url when provided", async () => {
    const res = await POST(
      postReq({ title: "Inception", cda_url: "https://www.cda.pl/video/test" }),
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT cda_url FROM movies WHERE id = ?").get(id) as { cda_url: string };
    expect(row.cda_url).toBe("https://www.cda.pl/video/test");
  });

  it("does not set user_rating when not provided (remains null)", async () => {
    const res = await POST(postReq({ title: "Inception" }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT user_rating FROM movies WHERE id = ?").get(id) as { user_rating: number | null };
    expect(row.user_rating).toBeNull();
  });

  it("creates a series entry when type=series is specified", async () => {
    const res = await POST(postReq({ title: "Breaking Bad", type: "series", tmdb_id: 1396 }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT type FROM movies WHERE id = ?").get(id) as { type: string };
    expect(row.type).toBe("series");
  });
});
