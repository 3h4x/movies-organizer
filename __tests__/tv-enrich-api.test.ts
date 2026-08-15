// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { TmdbSearchResult } from "@/lib/tmdb";

vi.mock("@/lib/tmdb", () => ({
  searchTmdb: vi.fn(),
}));

import { clearTvEnrichCache } from "@/app/api/tv/enrich/cache";
import { POST } from "@/app/api/tv/enrich/route";
import { initDb } from "@/lib/db";
import { searchTmdb } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-tv-enrich-api.db");

function makeResult(overrides: Partial<TmdbSearchResult> = {}): TmdbSearchResult {
  return {
    title: "Interstellar",
    year: 2014,
    genre: "Science Fiction",
    rating: 8.4,
    poster_url: null,
    tmdb_id: 157336,
    imdb_id: "tt0816692",
    ...overrides,
  };
}

function makeRequest(titles: string[]) {
  return new Request("http://localhost/api/tv/enrich", {
    method: "POST",
    body: JSON.stringify({ titles }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/tv/enrich", () => {
  let db: Database.Database | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Database(TEST_DB);
    initDb(db);
    clearTvEnrichCache();
  });

  afterEach(() => {
    db?.close();
    db = undefined;
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns rating and year for a matched title", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([makeResult({ rating: 8.4, year: 2014 })]);
    const res = await POST(makeRequest(["Interstellar 2014"]));
    const data = await res.json();
    expect(data["Interstellar 2014"]).toEqual({ rating: 8.4, year: 2014 });
  });

  it("returns null rating and year when TMDb returns no results", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([]);
    const res = await POST(makeRequest(["Unknown Film XYZ123"]));
    const data = await res.json();
    expect(data["Unknown Film XYZ123"]).toEqual({ rating: null, year: null });
  });

  it("returns null rating and year on TMDb error", async () => {
    vi.mocked(searchTmdb).mockRejectedValue(new Error("network error"));
    const res = await POST(makeRequest(["Error Film ABC"]));
    const data = await res.json();
    expect(data["Error Film ABC"]).toEqual({ rating: null, year: null });
  });

  it("handles multiple titles in one request", async () => {
    vi.mocked(searchTmdb)
      .mockResolvedValueOnce([makeResult({ title: "The Matrix", rating: 8.7, year: 1999 })])
      .mockResolvedValueOnce([makeResult({ title: "Blade Runner", rating: 8.1, year: 1982 })]);
    const res = await POST(makeRequest(["The Matrix multi", "Blade Runner multi"]));
    const data = await res.json();
    expect(data["The Matrix multi"]).toMatchObject({ rating: 8.7, year: 1999 });
    expect(data["Blade Runner multi"]).toMatchObject({ rating: 8.1, year: 1982 });
    expect(searchTmdb).toHaveBeenCalledTimes(2);
  });

  it("returns empty object for empty titles array", async () => {
    const res = await POST(makeRequest([]));
    const data = await res.json();
    expect(data).toEqual({});
    expect(searchTmdb).not.toHaveBeenCalled();
  });

  it("uses cached result for repeated title (no second TMDb call)", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([makeResult({ rating: 7.5, year: 2010 })]);
    await POST(makeRequest(["Inception cached"]));
    vi.clearAllMocks();
    vi.mocked(searchTmdb).mockResolvedValue([makeResult({ rating: 9.9, year: 2099 })]);
    const res = await POST(makeRequest(["Inception cached"]));
    const data = await res.json();
    expect(searchTmdb).not.toHaveBeenCalled();
    expect(data["Inception cached"]).toMatchObject({ rating: 7.5, year: 2010 });
  });

  it("does not read from library rows when enriching guide titles", async () => {
    db!.prepare(`
      INSERT INTO movies (title, year, genre, director, writer, actors, rating, poster_url, source, imdb_id, tmdb_id, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "Existing TV Film",
      1999,
      "Drama",
      null,
      null,
      null,
      8.9,
      "https://image.tmdb.org/t/p/w300/existing.jpg",
      "tmdb",
      "tt1234567",
      123456,
      "movie",
    );

    vi.mocked(searchTmdb).mockResolvedValue([makeResult({ rating: 7.4, year: 2001 })]);
    const res = await POST(makeRequest(["Existing TV Film"]));
    const data = await res.json();

    expect(searchTmdb).toHaveBeenCalledWith("Existing TV Film");
    expect(data["Existing TV Film"]).toEqual({ rating: 7.4, year: 2001 });
  });

  it("does not persist TMDb matches into the library", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([
      makeResult({
        title: "Fresh TV Movie",
        year: 2007,
        genre: "Thriller",
        rating: 7.1,
        poster_url: "https://image.tmdb.org/t/p/w300/fresh.jpg",
        tmdb_id: 7007,
        imdb_id: "tt7007007",
      }),
    ]);

    const res = await POST(makeRequest(["Fresh TV Movie"]));
    const data = await res.json();
    const row = db!.prepare("SELECT * FROM movies WHERE tmdb_id = ?").get(7007);

    expect(res.status).toBe(200);
    expect(data["Fresh TV Movie"]).toEqual({ rating: 7.1, year: 2007 });
    expect(row).toBeUndefined();
  });

  it("does not let a same-title library row override a remake match", async () => {
    db!.prepare(`
      INSERT INTO movies (title, year, genre, director, writer, actors, rating, poster_url, source, imdb_id, tmdb_id, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "Suspiria",
      2018,
      "Horror",
      null,
      null,
      null,
      6.7,
      "https://image.tmdb.org/t/p/w300/suspiria-2018.jpg",
      "tmdb",
      "tt1034415",
      450465,
      "movie",
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      makeResult({
        title: "Suspiria",
        year: 1977,
        rating: 7.3,
        tmdb_id: 11906,
        imdb_id: "tt0076786",
      }),
    ]);

    const res = await POST(makeRequest(["Suspiria"]));
    const data = await res.json();

    expect(searchTmdb).toHaveBeenCalledWith("Suspiria");
    expect(data["Suspiria"]).toEqual({ rating: 7.3, year: 1977 });
  });

  it("uses only the top TMDb result when multiple hits are returned", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([
      makeResult({ rating: 9.0, year: 2020 }),
      makeResult({ rating: 5.0, year: 2005 }),
    ]);
    const res = await POST(makeRequest(["Top Result Only"]));
    const data = await res.json();
    expect(data["Top Result Only"]).toMatchObject({ rating: 9.0, year: 2020 });
  });

  it("handles mixed success and error titles", async () => {
    vi.mocked(searchTmdb)
      .mockResolvedValueOnce([makeResult({ rating: 7.8, year: 2015 })])
      .mockRejectedValueOnce(new Error("API error"));
    const res = await POST(makeRequest(["Good Film mixed", "Bad Film mixed"]));
    const data = await res.json();
    expect(data["Good Film mixed"]).toMatchObject({ rating: 7.8, year: 2015 });
    expect(data["Bad Film mixed"]).toEqual({ rating: null, year: null });
  });

  it("returns 200 status on success", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([]);
    const res = await POST(makeRequest(["Status Check"]));
    expect(res.status).toBe(200);
  });

  it("returns 400 when titles is not an array", async () => {
    const req = new Request("http://localhost/api/tv/enrich", {
      method: "POST",
      body: JSON.stringify({ titles: "not an array" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/array/i);
    expect(searchTmdb).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON without logging an unexpected route failure", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://localhost/api/tv/enrich", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/valid json/i);
    expect(searchTmdb).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "[TV enrich] Unexpected route failure",
      expect.anything(),
    );
    consoleErrorSpy.mockRestore();
  });

  it("returns 400 when titles contains non-string items", async () => {
    const req = new Request("http://localhost/api/tv/enrich", {
      method: "POST",
      body: JSON.stringify({ titles: ["valid", 42, null] }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/string/i);
    expect(searchTmdb).not.toHaveBeenCalled();
  });

  it("returns 400 when titles array exceeds 500 items", async () => {
    const req = new Request("http://localhost/api/tv/enrich", {
      method: "POST",
      body: JSON.stringify({ titles: Array.from({ length: 501 }, (_, i) => `Film ${i}`) }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/500/);
    expect(searchTmdb).not.toHaveBeenCalled();
  });
});
