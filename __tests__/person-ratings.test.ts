// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb } from "@/lib/db";
import { buildPersonMap } from "@/app/api/person-ratings/route";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

interface RatedMovie {
  id: number;
  title: string;
  year: number | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  user_rating: number;
}

function makeMovie(overrides: Partial<RatedMovie> & { title: string; user_rating: number }): RatedMovie {
  return {
    id: 1,
    year: 2020,
    director: null,
    writer: null,
    actors: null,
    ...overrides,
  };
}

describe("buildPersonMap", () => {
  it("returns empty map for empty input", () => {
    expect(buildPersonMap([])).toEqual(new Map());
  });

  it("creates a director entry from a movie", () => {
    const movies = [makeMovie({ id: 1, title: "Inception", director: "Christopher Nolan", user_rating: 9 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Christopher Nolan::director");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Christopher Nolan");
    expect(entry!.role).toBe("director");
    expect(entry!.movie_count).toBe(1);
    expect(entry!.avg_rating).toBe(9);
  });

  it("creates an actor entry from a movie", () => {
    const movies = [makeMovie({ id: 1, title: "Inception", actors: "Leonardo DiCaprio", user_rating: 9 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Leonardo DiCaprio::actor");
    expect(entry).toBeDefined();
    expect(entry!.role).toBe("actor");
    expect(entry!.movie_count).toBe(1);
  });

  it("creates a writer entry from a movie", () => {
    const movies = [makeMovie({ id: 1, title: "Inception", writer: "Christopher Nolan", user_rating: 9 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Christopher Nolan::writer");
    expect(entry).toBeDefined();
    expect(entry!.role).toBe("writer");
  });

  it("handles multiple comma-separated directors", () => {
    const movies = [makeMovie({ id: 1, title: "Movie", director: "Director A, Director B", user_rating: 8 })];
    const map = buildPersonMap(movies);
    expect(map.has("Director A::director")).toBe(true);
    expect(map.has("Director B::director")).toBe(true);
  });

  it("accumulates movies for the same person across multiple films", () => {
    const movies = [
      makeMovie({ id: 1, title: "Inception", director: "Christopher Nolan", user_rating: 9 }),
      makeMovie({ id: 2, title: "Interstellar", director: "Christopher Nolan", user_rating: 10 }),
    ];
    const map = buildPersonMap(movies);
    const entry = map.get("Christopher Nolan::director");
    expect(entry!.movie_count).toBe(2);
    expect(entry!.movies).toHaveLength(2);
  });

  it("calculates avg_rating correctly", () => {
    const movies = [
      makeMovie({ id: 1, title: "Film A", director: "Jane Doe", user_rating: 8 }),
      makeMovie({ id: 2, title: "Film B", director: "Jane Doe", user_rating: 6 }),
    ];
    const map = buildPersonMap(movies);
    const entry = map.get("Jane Doe::director");
    expect(entry!.avg_rating).toBe(7);
  });

  it("rounds avg_rating to one decimal place", () => {
    const movies = [
      makeMovie({ id: 1, title: "Film A", director: "Jane Doe", user_rating: 7 }),
      makeMovie({ id: 2, title: "Film B", director: "Jane Doe", user_rating: 8 }),
      makeMovie({ id: 3, title: "Film C", director: "Jane Doe", user_rating: 9 }),
    ];
    const map = buildPersonMap(movies);
    // (7+8+9)/3 = 8.0
    expect(map.get("Jane Doe::director")!.avg_rating).toBe(8);

    const moviesOdd = [
      makeMovie({ id: 4, title: "Film D", director: "John Doe", user_rating: 7 }),
      makeMovie({ id: 5, title: "Film E", director: "John Doe", user_rating: 8 }),
    ];
    const map2 = buildPersonMap(moviesOdd);
    // (7+8)/2 = 7.5
    expect(map2.get("John Doe::director")!.avg_rating).toBe(7.5);
  });

  it("treats same person in different roles as separate entries", () => {
    const movies = [
      makeMovie({ id: 1, title: "Film", director: "Orson Welles", actors: "Orson Welles", user_rating: 9 }),
    ];
    const map = buildPersonMap(movies);
    expect(map.has("Orson Welles::director")).toBe(true);
    expect(map.has("Orson Welles::actor")).toBe(true);
    expect(map.get("Orson Welles::director")!.role).toBe("director");
    expect(map.get("Orson Welles::actor")!.role).toBe("actor");
  });

  it("filters by filterNames (single name)", () => {
    const movies = [
      makeMovie({ id: 1, title: "Inception", director: "Christopher Nolan", user_rating: 9 }),
      makeMovie({ id: 2, title: "Parasite", director: "Bong Joon-ho", user_rating: 10 }),
    ];
    const filter = new Set(["christopher nolan"]);
    const map = buildPersonMap(movies, filter);
    expect(map.has("Christopher Nolan::director")).toBe(true);
    expect(map.has("Bong Joon-ho::director")).toBe(false);
  });

  it("filterNames set must contain pre-lowercased values (matches how route uses it)", () => {
    const movies = [makeMovie({ id: 1, title: "Film", director: "Stanley Kubrick", user_rating: 9 })];
    // The route lowercases query params before building the Set — the function checks personName.toLowerCase()
    const filter = new Set(["stanley kubrick"]);
    const map = buildPersonMap(movies, filter);
    expect(map.has("Stanley Kubrick::director")).toBe(true);
  });

  it("returns empty map when filterNames does not match any person", () => {
    const movies = [makeMovie({ id: 1, title: "Film", director: "Stanley Kubrick", user_rating: 9 })];
    const filter = new Set(["no one"]);
    const map = buildPersonMap(movies, filter);
    expect(map.size).toBe(0);
  });

  it("includes correct movie metadata in the movies array", () => {
    const movies = [makeMovie({ id: 42, title: "The Godfather", year: 1972, director: "Francis Ford Coppola", user_rating: 10 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Francis Ford Coppola::director");
    expect(entry!.movies[0]).toEqual({ id: 42, title: "The Godfather", year: 1972, user_rating: 10 });
  });

  it("ignores movies with null director/writer/actors", () => {
    const movies = [makeMovie({ id: 1, title: "Mystery Film", director: null, writer: null, actors: null, user_rating: 5 })];
    expect(buildPersonMap(movies).size).toBe(0);
  });

  it("handles whitespace-only comma-separated values", () => {
    const movies = [makeMovie({ id: 1, title: "Film", director: "  ,  , Valid Name", user_rating: 7 })];
    const map = buildPersonMap(movies);
    // Only "Valid Name" should be added; empty strings after trim are filtered
    expect(map.has("Valid Name::director")).toBe(true);
    expect(map.size).toBe(1);
  });
});

// ── GET /api/person-ratings (HTTP handler) ───────────────────────────────────

const TEST_DB = path.join(__dirname, "test-person-ratings.db");

describe("GET /api/person-ratings", () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = new Database(TEST_DB);
    initDb(db);
    const { getDb } = await import("@/lib/db");
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    // Seed: Nolan directed 2 films (avg 9.5), Spielberg directed 1 (avg 8)
    // Actor DiCaprio in 2 films (avg 9)
    db.prepare(
      "INSERT INTO movies (title, year, director, actors, writer, source, type, user_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("Inception", 2010, "Christopher Nolan", "Leonardo DiCaprio", "Christopher Nolan", "tmdb", "movie", 9);
    db.prepare(
      "INSERT INTO movies (title, year, director, actors, writer, source, type, user_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("Interstellar", 2014, "Christopher Nolan", "Matthew McConaughey", "Christopher Nolan", "tmdb", "movie", 10);
    db.prepare(
      "INSERT INTO movies (title, year, director, actors, writer, source, type, user_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("Schindler's List", 1993, "Steven Spielberg", "Leonardo DiCaprio", null, "tmdb", "movie", 8);
    // Unrated movie — should be excluded from all results
    db.prepare(
      "INSERT INTO movies (title, year, director, source, type) VALUES (?, ?, ?, ?, ?)",
    ).run("Unrated Film", 2020, "Unknown Director", "tmdb", "movie");
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  function req(qs = "") {
    return new NextRequest(`http://localhost/api/person-ratings${qs ? `?${qs}` : ""}`);
  }

  it("returns top-rated people with movie_count >= 2 sorted by avg_rating desc", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req());
    const body = await res.json();

    // Nolan: director avg 9.5, writer avg 9.5 (both have 2 films)
    // DiCaprio: actor avg 8.5 (2 films)
    // Spielberg: 1 film only — excluded
    const names = body.map((p: { name: string }) => p.name);
    expect(names).not.toContain("Steven Spielberg");
    expect(names).not.toContain("Unknown Director");
    // All returned entries have movie_count >= 2
    expect(body.every((p: { movie_count: number }) => p.movie_count >= 2)).toBe(true);
    // Sorted descending by avg_rating
    const ratings = body.map((p: { avg_rating: number }) => p.avg_rating);
    expect(ratings).toEqual([...ratings].sort((a: number, b: number) => b - a));
  });

  it("filters by role=director", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("role=director"));
    const body = await res.json();

    expect(body.every((p: { role: string }) => p.role === "director")).toBe(true);
    expect(body.some((p: { name: string }) => p.name === "Christopher Nolan")).toBe(true);
    // DiCaprio is an actor — should not appear
    expect(body.every((p: { name: string }) => p.name !== "Leonardo DiCaprio")).toBe(true);
  });

  it("respects the limit param", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("limit=1"));
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("returns specific person by ?name= param (bypasses movie_count filter)", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("name=Steven Spielberg"));
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Steven Spielberg");
    expect(body[0].role).toBe("director");
    expect(body[0].movie_count).toBe(1);
  });

  it("returns multiple people by ?names= params", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("names=Christopher Nolan&names=Leonardo DiCaprio"));
    const body = await res.json();

    const names = body.map((p: { name: string; role: string }) => `${p.name}::${p.role}`);
    expect(names).toContain("Christopher Nolan::director");
    expect(names).toContain("Leonardo DiCaprio::actor");
    expect(body.every((p: { name: string }) => ["Christopher Nolan", "Leonardo DiCaprio"].includes(p.name))).toBe(true);
  });

  it("returns empty array when name param matches no one", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("name=Nobody Here"));
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("name lookup is case-insensitive", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("name=christopher nolan"));
    const body = await res.json();
    expect(body.some((p: { name: string }) => p.name === "Christopher Nolan")).toBe(true);
  });

  it("returns 400 when limit is NaN (non-numeric string)", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("limit=abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it("returns 400 when limit is 0", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("limit=0"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it("returns 400 when limit is negative", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("limit=-5"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it("clamps limit to 200 when an excessively large value is passed", async () => {
    const { GET } = await import("@/app/api/person-ratings/route");
    const res = await GET(req("limit=99999"));
    expect(res.status).toBe(200);
    // With only 3 people with movie_count >= 2, the clamped limit doesn't trim results
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
