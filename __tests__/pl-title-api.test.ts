// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  initDb,
  insertMovie,
  saveRecommendedMovies,
  getRecommendedMovies,
} from "@/lib/db";

// Patch only getDb so the route uses our test DB.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/lib/tmdb", () => ({
  getMovieLocalized: vi.fn(),
}));

import { GET } from "@/app/api/pl-title/route";
import { getDb } from "@/lib/db";
import { getMovieLocalized } from "@/lib/tmdb";

const mockGetMovieLocalized = vi.mocked(getMovieLocalized);

const TEST_DB = path.join(__dirname, "test-pl-title.db");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/pl-title");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

describe("GET /api/pl-title", () => {
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

  it("returns null values when tmdb_id query param is missing", async () => {
    const res = await GET(makeRequest({}));
    const data = await res.json();
    expect(data).toEqual({ pl_title: null, description: null });
    expect(mockGetMovieLocalized).not.toHaveBeenCalled();
  });

  it("returns null values when tmdb_id is empty string", async () => {
    const res = await GET(makeRequest({ tmdb_id: "" }));
    const data = await res.json();
    expect(data).toEqual({ pl_title: null, description: null });
    expect(mockGetMovieLocalized).not.toHaveBeenCalled();
  });

  it("returns null values when tmdb_id is non-numeric", async () => {
    const res = await GET(makeRequest({ tmdb_id: "abc" }));
    const data = await res.json();
    expect(data).toEqual({ pl_title: null, description: null });
    expect(mockGetMovieLocalized).not.toHaveBeenCalled();
  });

  it("calls getMovieLocalized with the parsed tmdb_id", async () => {
    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: null,
      description: null,
    });

    await GET(makeRequest({ tmdb_id: "27205" }));
    expect(mockGetMovieLocalized).toHaveBeenCalledWith(27205);
  });

  it("returns pl_title and description from TMDb", async () => {
    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: "Incepcja",
      description: "Złodziej śni...",
    });

    const res = await GET(makeRequest({ tmdb_id: "27205" }));
    const data = await res.json();
    expect(data.pl_title).toBe("Incepcja");
    expect(data.description).toBe("Złodziej śni...");
  });

  it("returns null values when TMDb has no localized data", async () => {
    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: null,
      description: null,
    });

    const res = await GET(makeRequest({ tmdb_id: "27205" }));
    const data = await res.json();
    expect(data).toEqual({ pl_title: null, description: null });
  });

  it("saves pl_title to recommended_movies when a match exists", async () => {
    // Seed a recommended movie record
    saveRecommendedMovies(db, "genre", "By genre", [
      {
        tmdb_id: 27205,
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.8,
        poster_url: null,
      },
    ]);

    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: "Incepcja",
      description: null,
    });

    await GET(makeRequest({ tmdb_id: "27205" }));

    const movies = getRecommendedMovies(db, "genre");
    expect(movies[0].pl_title).toBe("Incepcja");
  });

  it("saves description to recommended_movies when a match exists", async () => {
    saveRecommendedMovies(db, "actor", "By actor", [
      {
        tmdb_id: 27205,
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.8,
        poster_url: null,
      },
    ]);

    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: null,
      description: "A thief who steals secrets...",
    });

    await GET(makeRequest({ tmdb_id: "27205" }));

    const movies = getRecommendedMovies(db, "actor");
    expect(movies[0].description).toBe("A thief who steals secrets...");
  });

  it("updates pl_title on library movie that has same tmdb_id", async () => {
    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });

    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: "Incepcja",
      description: null,
    });

    await GET(makeRequest({ tmdb_id: "27205" }));

    const movie = db
      .prepare("SELECT pl_title FROM movies WHERE tmdb_id = ?")
      .get(27205) as { pl_title: string } | undefined;
    expect(movie?.pl_title).toBe("Incepcja");
  });

  it("does not overwrite existing pl_title on library movie", async () => {
    const id = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    db.prepare("UPDATE movies SET pl_title = ? WHERE id = ?").run(
      "Istniejący tytuł",
      id,
    );

    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: "Incepcja",
      description: null,
    });

    await GET(makeRequest({ tmdb_id: "27205" }));

    const movie = db
      .prepare("SELECT pl_title FROM movies WHERE tmdb_id = ?")
      .get(27205) as { pl_title: string } | undefined;
    // SQL uses WHERE pl_title IS NULL, so existing value should not be overwritten
    expect(movie?.pl_title).toBe("Istniejący tytuł");
  });

  it("updates description on library movie that has same tmdb_id", async () => {
    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });

    mockGetMovieLocalized.mockResolvedValueOnce({
      pl_title: null,
      description: "Dom Cobb jest złodziejem...",
    });

    await GET(makeRequest({ tmdb_id: "27205" }));

    const movie = db
      .prepare("SELECT description FROM movies WHERE tmdb_id = ?")
      .get(27205) as { description: string } | undefined;
    expect(movie?.description).toBe("Dom Cobb jest złodziejem...");
  });
});
