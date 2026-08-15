// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  initDb,
  getDismissedIds,
  setCachedEngine,
  saveRecommendedMovies,
  insertMovie,
} from "@/lib/db";
import type { RecommendationGroup } from "@/lib/engines";

// ── Engines mock for the count route ─────────────────────────────────────────
vi.mock("@/lib/engines", () => ({
  engines: {
    genre: { name: "By Genre", icon: "🎭", dbBacked: false },
    cda: { name: "On CDA", icon: "📺", dbBacked: true },
  },
}));

// Patch getDb for both routes under test.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST as dismissPOST } from "@/app/api/recommendations/dismiss/route";
import { GET as countGET } from "@/app/api/recommendations/count/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-dismiss-count.db");

describe("recommendations/dismiss POST", () => {
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

  function req(body: object) {
    return new NextRequest("http://localhost/api/recommendations/dismiss", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 400 when tmdb_id is missing", async () => {
    const res = await dismissPOST(req({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 when tmdb_id is not a number", async () => {
    const res = await dismissPOST(req({ tmdb_id: "not-a-number" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns ok:true when dismissal succeeds", async () => {
    const res = await dismissPOST(req({ tmdb_id: 12345 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("inserts the tmdb_id into dismissed_recommendations", async () => {
    await dismissPOST(req({ tmdb_id: 42 }));
    const dismissed = getDismissedIds(db);
    expect(dismissed.has(42)).toBe(true);
  });

  it("is idempotent — dismissing the same id twice does not throw", async () => {
    await dismissPOST(req({ tmdb_id: 99 }));
    const res = await dismissPOST(req({ tmdb_id: 99 }));
    expect(res.status).toBe(200);
    const dismissed = getDismissedIds(db);
    expect([...dismissed].filter((id) => id === 99)).toHaveLength(1);
  });
});

describe("recommendations/count GET", () => {
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

  it("returns total:0 when there are no recommendations or cache", async () => {
    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(0);
  });

  it("counts non-dismissed recommendations from cache (non-db-backed engine)", async () => {
    const group: RecommendationGroup = {
      type: "genre",
      reason: "Because you like Drama",
      recommendations: [
        { tmdb_id: 1, title: "Film A", year: 2020, genre: "Drama", rating: 7, poster_url: null, imdb_id: null },
        { tmdb_id: 2, title: "Film B", year: 2021, genre: "Drama", rating: 8, poster_url: null, imdb_id: null },
      ],
    };
    // movieCount = 0 (empty library)
    setCachedEngine(db, "genre", [group], 0);

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(2);
  });

  it("excludes dismissed ids from the count (non-db-backed engine)", async () => {
    const group: RecommendationGroup = {
      type: "genre",
      reason: "By genre",
      recommendations: [
        { tmdb_id: 10, title: "Film X", year: 2020, genre: "Action", rating: 7, poster_url: null, imdb_id: null },
        { tmdb_id: 11, title: "Film Y", year: 2021, genre: "Action", rating: 8, poster_url: null, imdb_id: null },
      ],
    };
    setCachedEngine(db, "genre", [group], 0);
    // Dismiss one
    db.prepare(
      "INSERT OR IGNORE INTO dismissed_recommendations (tmdb_id) VALUES (?)",
    ).run(10);

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(1);
  });

  it("excludes rated ids from the count (non-db-backed engine)", async () => {
    const group: RecommendationGroup = {
      type: "genre",
      reason: "By genre",
      recommendations: [
        { tmdb_id: 10, title: "Film X", year: 2020, genre: "Action", rating: 7, poster_url: null, imdb_id: null },
        { tmdb_id: 11, title: "Film Y", year: 2021, genre: "Action", rating: 8, poster_url: null, imdb_id: null },
      ],
    };
    setCachedEngine(db, "genre", [group], 1);
    insertMovie(db, {
      title: "Film X",
      year: 2020,
      genre: "Action",
      director: null,
      rating: 7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 10,
      type: "movie",
    });
    db.prepare("UPDATE movies SET user_rating = 8 WHERE tmdb_id = 10").run();

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(1);
  });

  it("does not exclude a movie because of a rated tv row with the same tmdb_id", async () => {
    const group: RecommendationGroup = {
      type: "genre",
      reason: "By genre",
      recommendations: [
        { tmdb_id: 10, title: "Film X", year: 2020, genre: "Action", rating: 7, poster_url: null, imdb_id: null },
      ],
    };
    setCachedEngine(db, "genre", [group], 1);
    insertMovie(db, {
      title: "Series X",
      year: 2020,
      genre: "Action",
      director: null,
      rating: 7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 10,
      type: "tv",
    });
    db.prepare("UPDATE movies SET user_rating = 8 WHERE tmdb_id = 10 AND type = 'tv'").run();

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(1);
  });

  it("counts non-dismissed recommendations from recommended_movies table (db-backed engine)", async () => {
    saveRecommendedMovies(db, "cda", "Available on CDA", [
      { tmdb_id: 20, title: "CDA Film 1", year: 2020, genre: "Drama", rating: 7, poster_url: null },
      { tmdb_id: 21, title: "CDA Film 2", year: 2021, genre: "Drama", rating: 8, poster_url: null },
      { tmdb_id: 22, title: "CDA Film 3", year: 2022, genre: "Drama", rating: 9, poster_url: null },
    ]);

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(3);
  });

  it("excludes dismissed ids from db-backed engine count", async () => {
    saveRecommendedMovies(db, "cda", "CDA picks", [
      { tmdb_id: 30, title: "CDA A", year: 2020, genre: "Action", rating: 7, poster_url: null },
      { tmdb_id: 31, title: "CDA B", year: 2021, genre: "Action", rating: 8, poster_url: null },
    ]);
    db.prepare(
      "INSERT OR IGNORE INTO dismissed_recommendations (tmdb_id) VALUES (?)",
    ).run(30);

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(1);
  });

  it("excludes rated ids from db-backed engine count", async () => {
    saveRecommendedMovies(db, "cda", "CDA picks", [
      { tmdb_id: 30, title: "CDA A", year: 2020, genre: "Action", rating: 7, poster_url: null },
      { tmdb_id: 31, title: "CDA B", year: 2021, genre: "Action", rating: 8, poster_url: null },
    ]);
    insertMovie(db, {
      title: "CDA A",
      year: 2020,
      genre: "Action",
      director: null,
      rating: 7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 30,
      type: "movie",
    });
    db.prepare("UPDATE movies SET user_rating = 9 WHERE tmdb_id = 30").run();

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(1);
  });

  it("sums counts across both cache and db-backed engines", async () => {
    // Non-db-backed (genre): 2 recs in cache
    const group: RecommendationGroup = {
      type: "genre",
      reason: "Genre picks",
      recommendations: [
        { tmdb_id: 40, title: "G1", year: 2020, genre: "Drama", rating: 7, poster_url: null, imdb_id: null },
        { tmdb_id: 41, title: "G2", year: 2021, genre: "Drama", rating: 8, poster_url: null, imdb_id: null },
      ],
    };
    setCachedEngine(db, "genre", [group], 0);

    // DB-backed (cda): 3 recs
    saveRecommendedMovies(db, "cda", "CDA", [
      { tmdb_id: 50, title: "C1", year: 2020, genre: "Drama", rating: 7, poster_url: null },
      { tmdb_id: 51, title: "C2", year: 2021, genre: "Drama", rating: 8, poster_url: null },
      { tmdb_id: 52, title: "C3", year: 2022, genre: "Drama", rating: 9, poster_url: null },
    ]);

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(5);
  });

  it("returns total:0 for a non-db-backed engine when its cache entry has expired (TTL)", async () => {
    const group: RecommendationGroup = {
      type: "genre",
      reason: "Old picks",
      recommendations: [
        { tmdb_id: 88, title: "Expired Film", year: 2018, genre: "Thriller", rating: 6, poster_url: null, imdb_id: null },
      ],
    };
    // Insert cache with a timestamp older than the default 24h TTL
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "");
    db.prepare(
      "INSERT OR REPLACE INTO recommendation_cache (engine, data, movie_count, created_at) VALUES (?, ?, ?, ?)",
    ).run("genre", JSON.stringify([group]), 0, oldTimestamp);

    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(0);
  });

  it("recommendation-sourced movies do not affect the cache key (count uses library-only)", async () => {
    // Cache set for an empty library (movieCount = 0)
    const group: RecommendationGroup = {
      type: "genre",
      reason: "Genre picks",
      recommendations: [
        { tmdb_id: 70, title: "Rec A", year: 2020, genre: "Drama", rating: 7, poster_url: null, imdb_id: null },
      ],
    };
    setCachedEngine(db, "genre", [group], 0);

    // Insert a recommendation-sourced movie — must NOT shift the count key
    insertMovie(db, {
      title: "Rec A",
      year: 2020,
      genre: "Drama",
      director: null,
      rating: 7,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: 70,
      type: "movie",
    });

    // Cache should still be valid (library count = 0 = cache key 0)
    const res = await countGET();
    const data = await res.json();
    expect(data.total).toBe(1);
  });
});
