// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET, POST } from "@/app/api/movies/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-movies-post-api.db");

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/movies", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

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
    const res = await POST(postReq({ year: 2020 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when year is below 1888", async () => {
    const res = await POST(postReq({ title: "Old Film", year: 1887 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year/);
  });

  it("returns 400 when year is above 2200", async () => {
    const res = await POST(postReq({ title: "Future Film", year: 2201 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year/);
  });

  it("returns 400 when year is not an integer", async () => {
    const res = await POST(postReq({ title: "Bad Year", year: 2010.5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year/);
  });

  it("accepts year=null without error", async () => {
    const res = await POST(postReq({ title: "No Year", year: null }));
    expect(res.status).toBe(201);
  });

  it("returns 400 when user_rating is out of range", async () => {
    const res = await POST(postReq({ title: "Test", user_rating: 11 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/user_rating/);
  });

  it("returns 400 when user_rating is zero", async () => {
    const res = await POST(postReq({ title: "Test", user_rating: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/user_rating/);
  });

  it("accepts user_rating=null without error", async () => {
    const res = await POST(postReq({ title: "Test", user_rating: null }));
    expect(res.status).toBe(201);
  });

  it("returns 400 when wishlist is not 0 or 1", async () => {
    const res = await POST(postReq({ title: "Test", wishlist: 2 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/wishlist/);
  });

  it("accepts wishlist=0 without error", async () => {
    const res = await POST(postReq({ title: "Test", wishlist: 0 }));
    expect(res.status).toBe(201);
  });

  it("accepts wishlist=null without error (treated as not set)", async () => {
    const res = await POST(postReq({ title: "Test", wishlist: null }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT wishlist FROM movies WHERE id = ?").get(id) as { wishlist: number };
    expect(row.wishlist).toBe(0);
  });

  it("returns 201 with id on success", async () => {
    const res = await POST(postReq({ title: "Interstellar" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe("number");
    expect(body.id).toBeGreaterThan(0);
  });

  it("creates a movie with minimal fields (title only)", async () => {
    await POST(postReq({ title: "Dune" }));
    const row = db.prepare("SELECT * FROM movies WHERE title = 'Dune'").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.title).toBe("Dune");
    expect(row.year).toBeNull();
    expect(row.genre).toBeNull();
    expect(row.director).toBeNull();
    expect(row.rating).toBeNull();
  });

  it("defaults type to 'movie' when not provided", async () => {
    await POST(postReq({ title: "The Matrix" }));
    const row = db.prepare("SELECT type FROM movies WHERE title = 'The Matrix'").get() as { type: string };
    expect(row.type).toBe("movie");
  });

  it("persists all standard fields correctly", async () => {
    await POST(
      postReq({
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi, Thriller",
        director: "Christopher Nolan",
        rating: 8.8,
        poster_url: "/poster.jpg",
        source: "tmdb",
        imdb_id: "tt1375666",
        tmdb_id: 27205,
        type: "movie",
        file_path: "/movies/Inception.mkv",
      }),
    );
    const row = db
      .prepare("SELECT * FROM movies WHERE tmdb_id = 27205")
      .get() as Record<string, unknown>;
    expect(row.title).toBe("Inception");
    expect(row.year).toBe(2010);
    expect(row.genre).toBe("Sci-Fi, Thriller");
    expect(row.director).toBe("Christopher Nolan");
    expect(row.rating).toBe(8.8);
    expect(row.poster_url).toBe("/poster.jpg");
    expect(row.source).toBe("tmdb");
    expect(row.imdb_id).toBe("tt1375666");
    expect(row.tmdb_id).toBe(27205);
    expect(row.file_path).toBe("/movies/Inception.mkv");
  });

  it("persists user_rating when provided", async () => {
    const res = await POST(postReq({ title: "The Shining", user_rating: 9 }));
    const body = await res.json();
    const row = db
      .prepare("SELECT user_rating FROM movies WHERE id = ?")
      .get(body.id) as { user_rating: number };
    expect(row.user_rating).toBe(9);
  });

  it("does not set user_rating when null (skips extra UPDATE)", async () => {
    const res = await POST(postReq({ title: "Blade Runner", user_rating: null }));
    const body = await res.json();
    const row = db
      .prepare("SELECT user_rating FROM movies WHERE id = ?")
      .get(body.id) as { user_rating: number | null };
    expect(row.user_rating).toBeNull();
  });

  it("persists wishlist when provided", async () => {
    const res = await POST(postReq({ title: "2001: A Space Odyssey", wishlist: 1 }));
    const body = await res.json();
    const row = db
      .prepare("SELECT wishlist FROM movies WHERE id = ?")
      .get(body.id) as { wishlist: number };
    expect(row.wishlist).toBe(1);
  });

  it("persists cda_url when provided", async () => {
    const res = await POST(
      postReq({ title: "Parasite", cda_url: "https://cda.pl/video/abc123" }),
    );
    const body = await res.json();
    const row = db
      .prepare("SELECT cda_url FROM movies WHERE id = ?")
      .get(body.id) as { cda_url: string };
    expect(row.cda_url).toBe("https://cda.pl/video/abc123");
  });

  it("respects type='series' when provided", async () => {
    await POST(postReq({ title: "Breaking Bad", type: "series" }));
    const row = db
      .prepare("SELECT type FROM movies WHERE title = 'Breaking Bad'")
      .get() as { type: string };
    expect(row.type).toBe("series");
  });

  it("nullifies optional fields when omitted from body", async () => {
    await POST(postReq({ title: "Fargo" }));
    const row = db
      .prepare("SELECT poster_url, imdb_id, tmdb_id, file_path FROM movies WHERE title = 'Fargo'")
      .get() as Record<string, unknown>;
    expect(row.poster_url).toBeNull();
    expect(row.imdb_id).toBeNull();
    expect(row.tmdb_id).toBeNull();
    expect(row.file_path).toBeNull();
  });
});

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

  it("returns an empty array when library is empty", async () => {
    const req = new NextRequest("http://localhost/api/movies");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns all movies when no type filter is provided", async () => {
    await POST(postReq({ title: "Inception", type: "movie" }));
    await POST(postReq({ title: "Breaking Bad", type: "series" }));

    const req = new NextRequest("http://localhost/api/movies");
    const res = await GET(req);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("filters by type when ?type= is provided", async () => {
    await POST(postReq({ title: "Inception", type: "movie" }));
    await POST(postReq({ title: "Breaking Bad", type: "series" }));

    const req = new NextRequest("http://localhost/api/movies?type=movie");
    const res = await GET(req);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Inception");
  });
});
