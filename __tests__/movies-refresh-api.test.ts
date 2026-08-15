import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { clearTmdbCache } from "@/lib/tmdb";
import { initDb, insertMovie } from "@/lib/db";
import { _resetForTests, _setBucketConfigForTests } from "@/lib/rate-limit";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST as POST_REFRESH } from "@/app/api/movies/[id]/refresh/route";
import { POST as POST_REFRESH_STALE } from "@/app/api/movies/refresh-stale/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-movies-refresh-api.db");
const mockFetch = vi.fn();
const originalFetch = global.fetch;

function postReq(url: string, body: Record<string, unknown> = {}) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function tmdbMovieResponse(id: number, title: string, posterPath: string) {
  return {
    ok: true,
    json: async () => ({
      id,
      title,
      release_date: "1995-12-15",
      genres: [{ id: 80, name: "Crime" }, { id: 18, name: "Drama" }],
      vote_average: 8.3,
      poster_path: posterPath,
      imdb_id: `tt${id}`,
      overview: `${title} overview`,
      credits: {
        crew: [
          { id: 1, name: "Michael Mann", job: "Director" },
          { id: 2, name: "Michael Mann", job: "Writer" },
        ],
        cast: [{ id: 3, name: "Al Pacino", character: "Vincent Hanna" }],
      },
    }),
  };
}

function localizedResponse(title: string) {
  return {
    ok: true,
    json: async () => ({ title, overview: `${title} opis` }),
  };
}

describe("TMDb metadata refresh API", () => {
  let db: Database.Database;
  const originalApiKey = process.env.TMDB_API_KEY;
  const originalRateLimitEnforce = process.env.RATE_LIMIT_ENFORCE_IN_TESTS;

  beforeEach(() => {
    _resetForTests();
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    clearTmdbCache();
    mockFetch.mockReset();
    global.fetch = mockFetch as typeof fetch;
    process.env.TMDB_API_KEY = "test-key";
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
    _resetForTests();
    clearTmdbCache();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.TMDB_API_KEY;
    } else {
      process.env.TMDB_API_KEY = originalApiKey;
    }
    if (originalRateLimitEnforce === undefined) {
      delete process.env.RATE_LIMIT_ENFORCE_IN_TESTS;
    } else {
      process.env.RATE_LIMIT_ENFORCE_IN_TESTS = originalRateLimitEnforce;
    }
  });

  it("refreshes one library row from TMDb and bumps tmdb_refreshed_at", async () => {
    const id = insertMovie(db, {
      title: "Old Heat",
      year: 1994,
      genre: "Old",
      director: "Old Director",
      rating: 6,
      poster_url: "/old.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 949,
      type: "movie",
    });
    mockFetch
      .mockResolvedValueOnce(tmdbMovieResponse(949, "Heat", "/heat.jpg"))
      .mockResolvedValueOnce(localizedResponse("Goraczka"));

    const res = await POST_REFRESH(postReq(`http://localhost/api/movies/${id}/refresh`), {
      params: Promise.resolve({ id: String(id) }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id,
      title: "Heat",
      genre: "Crime, Drama",
      director: "Michael Mann",
      poster_url: "https://image.tmdb.org/t/p/w300/heat.jpg",
      pl_title: "Goraczka",
    });
    expect(body.tmdb_refreshed_at).toEqual(expect.any(Number));
  });

  it("does not refresh TV rows through the movie TMDb endpoint", async () => {
    const id = insertMovie(db, {
      title: "Old Show",
      year: 2018,
      genre: "Drama",
      director: "Old Director",
      rating: 6,
      poster_url: "/old-show.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 949,
      type: "tv",
    });

    const res = await POST_REFRESH(postReq(`http://localhost/api/movies/${id}/refresh`), {
      params: Promise.resolve({ id: String(id) }),
    });
    const body = await res.json();
    const row = db.prepare("SELECT title, tmdb_refreshed_at FROM movies WHERE id = ?").get(id) as {
      title: string;
      tmdb_refreshed_at: number | null;
    };

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "TMDb refresh is only supported for movies" });
    expect(row.title).toBe("Old Show");
    expect(row.tmdb_refreshed_at).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refreshes only stale rows in the batch endpoint", async () => {
    const now = Math.floor(Date.now() / 1000);
    const staleId = insertMovie(db, {
      title: "Old Heat",
      year: 1994,
      genre: "Old",
      director: "Old Director",
      rating: 6,
      poster_url: "/old.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 949,
      type: "movie",
    });
    const freshId = insertMovie(db, {
      title: "Fresh",
      year: 2020,
      genre: "Drama",
      director: "Someone",
      rating: 7,
      poster_url: "/fresh.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 950,
      type: "movie",
    });
    db.prepare("UPDATE movies SET tmdb_refreshed_at = ? WHERE id = ?").run(now - 40 * 24 * 60 * 60, staleId);
    db.prepare("UPDATE movies SET tmdb_refreshed_at = ? WHERE id = ?").run(now - 2 * 24 * 60 * 60, freshId);
    mockFetch
      .mockResolvedValueOnce(tmdbMovieResponse(949, "Heat", "/heat.jpg"))
      .mockResolvedValueOnce(localizedResponse("Goraczka"));

    const res = await POST_REFRESH_STALE(
      postReq("http://localhost/api/movies/refresh-stale", {
        maxAgeDays: 30,
        delayMs: 0,
      }),
    );
    const body = await res.json();
    const stale = db.prepare("SELECT title, tmdb_refreshed_at FROM movies WHERE id = ?").get(staleId) as {
      title: string;
      tmdb_refreshed_at: number;
    };
    const fresh = db.prepare("SELECT title, tmdb_refreshed_at FROM movies WHERE id = ?").get(freshId) as {
      title: string;
      tmdb_refreshed_at: number;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({ updated: 1, skipped: 0 });
    expect(stale.title).toBe("Heat");
    expect(stale.tmdb_refreshed_at).toBeGreaterThan(now - 60);
    expect(fresh.title).toBe("Fresh");
    expect(fresh.tmdb_refreshed_at).toBe(now - 2 * 24 * 60 * 60);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("excludes stale TV rows from the batch endpoint", async () => {
    const now = Math.floor(Date.now() / 1000);
    const tvId = insertMovie(db, {
      title: "Old Show",
      year: 2018,
      genre: "Drama",
      director: "Old Director",
      rating: 6,
      poster_url: "/old-show.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 949,
      type: "tv",
    });
    db.prepare("UPDATE movies SET tmdb_refreshed_at = ? WHERE id = ?").run(
      now - 40 * 24 * 60 * 60,
      tvId,
    );

    const res = await POST_REFRESH_STALE(
      postReq("http://localhost/api/movies/refresh-stale", {
        maxAgeDays: 30,
        delayMs: 0,
      }),
    );
    const body = await res.json();
    const row = db.prepare("SELECT title, tmdb_refreshed_at FROM movies WHERE id = ?").get(tvId) as {
      title: string;
      tmdb_refreshed_at: number;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({ updated: 0, skipped: 0 });
    expect(row.title).toBe("Old Show");
    expect(row.tmdb_refreshed_at).toBe(now - 40 * 24 * 60 * 60);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("applies the mutation rate limit to the single refresh route", async () => {
    process.env.RATE_LIMIT_ENFORCE_IN_TESTS = "1";
    _resetForTests();
    _setBucketConfigForTests("mutation", { limit: 1, windowMs: 60_000 });
    _setBucketConfigForTests("tmdb", { limit: 100, windowMs: 60_000 });

    const first = await POST_REFRESH(postReq("http://localhost/api/movies/not-a-number/refresh"), {
      params: Promise.resolve({ id: "not-a-number" }),
    });
    const second = await POST_REFRESH(postReq("http://localhost/api/movies/not-a-number/refresh"), {
      params: Promise.resolve({ id: "not-a-number" }),
    });
    const body = await second.json();

    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
    expect(body.error).toBe("rate_limited");
  });

  it("applies the mutation rate limit to the stale batch route", async () => {
    process.env.RATE_LIMIT_ENFORCE_IN_TESTS = "1";
    _resetForTests();
    _setBucketConfigForTests("mutation", { limit: 1, windowMs: 60_000 });
    _setBucketConfigForTests("tmdb", { limit: 100, windowMs: 60_000 });

    const first = await POST_REFRESH_STALE(
      postReq("http://localhost/api/movies/refresh-stale", {
        delayMs: 0,
      }),
    );
    const second = await POST_REFRESH_STALE(
      postReq("http://localhost/api/movies/refresh-stale", {
        delayMs: 0,
      }),
    );
    const body = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(body.error).toBe("rate_limited");
  });
});
