// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { unlinkSync } from "fs";
import { initDb } from "@/lib/db";
import type { RecommendationGroup } from "@/lib/engines";
import type { TmdbSearchResult } from "@/lib/tmdb";
import { MOOD_KEYS } from "@/lib/mood-presets";

const { mockMoodEngine } = vi.hoisted(() => ({
  mockMoodEngine: vi.fn<() => Promise<RecommendationGroup[]>>(),
}));

vi.mock("@/lib/engines/mood", () => ({
  moodEngine: mockMoodEngine,
}));

vi.mock("@/lib/engines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engines")>();
  return {
    ...actual,
    getCdaLookup: vi.fn(() => ({
      byTmdbId: new Map<number, string>(),
      byTitle: new Map<string, string>(),
    })),
    enrichWithCda: vi.fn((results: TmdbSearchResult[]) => results),
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET } from "@/app/api/recommendations/mood/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-mood-api.db");

function makeRec(
  overrides: Partial<TmdbSearchResult> & { tmdb_id: number; title: string },
): TmdbSearchResult {
  return { year: 2020, genre: "Drama", rating: 7.5, poster_url: null, imdb_id: null, ...overrides };
}

describe("GET /api/recommendations/mood", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    mockMoodEngine.mockResolvedValue([]);
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it("returns 400 when key param is missing", async () => {
    const req = new NextRequest("http://localhost/api/recommendations/mood");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid mood key/i);
  });

  it("returns 400 when key is not a valid mood key", async () => {
    const req = new NextRequest("http://localhost/api/recommendations/mood?key=invalid_key");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid mood key/i);
  });

  it("returns 200 with empty array when engine returns no results", async () => {
    mockMoodEngine.mockResolvedValue([]);
    const req = new NextRequest("http://localhost/api/recommendations/mood?key=light_funny");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns groups from moodEngine", async () => {
    const group: RecommendationGroup = {
      reason: "Light & funny tonight",
      type: "mood",
      recommendations: [makeRec({ tmdb_id: 1, title: "Funny Movie" })],
    };
    mockMoodEngine.mockResolvedValue([group]);
    const req = new NextRequest("http://localhost/api/recommendations/mood?key=light_funny");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].recommendations[0].title).toBe("Funny Movie");
  });

  it("filters out movies the user has already rated", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, genre, rating, source, tmdb_id, type, user_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("Funny Movie", 2020, "Drama", 7.5, "tmdb", 1, "movie", 8);
    const group: RecommendationGroup = {
      reason: "Light & funny tonight",
      type: "mood",
      recommendations: [
        makeRec({ tmdb_id: 1, title: "Funny Movie" }),
        makeRec({ tmdb_id: 2, title: "Fresh Movie" }),
      ],
    };
    mockMoodEngine.mockResolvedValue([group]);

    const req = new NextRequest("http://localhost/api/recommendations/mood?key=light_funny");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].recommendations).toHaveLength(1);
    expect(body[0].recommendations[0].title).toBe("Fresh Movie");
  });

  it("does not filter out a movie because of a rated tv row with the same tmdb_id", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, genre, rating, source, tmdb_id, type, user_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("Funny Show", 2020, "Drama", 7.5, "tmdb", 1, "tv", 8);
    const group: RecommendationGroup = {
      reason: "Light & funny tonight",
      type: "mood",
      recommendations: [makeRec({ tmdb_id: 1, title: "Funny Movie" })],
    };
    mockMoodEngine.mockResolvedValue([group]);

    const req = new NextRequest("http://localhost/api/recommendations/mood?key=light_funny");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].recommendations).toHaveLength(1);
    expect(body[0].recommendations[0].title).toBe("Funny Movie");
  });

  it("keeps rated movies for the comfort_rewatch preset", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, genre, rating, source, tmdb_id, type, user_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("Comfort Movie", 1999, "Drama", 7.5, "tmdb", 3, "movie", 9);
    const group: RecommendationGroup = {
      reason: "Comfort picks from your library",
      type: "mood",
      recommendations: [makeRec({ tmdb_id: 3, title: "Comfort Movie" })],
    };
    mockMoodEngine.mockResolvedValue([group]);

    const req = new NextRequest("http://localhost/api/recommendations/mood?key=comfort_rewatch");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].recommendations).toHaveLength(1);
    expect(body[0].recommendations[0].title).toBe("Comfort Movie");
  });

  it("calls moodEngine with the correct key", async () => {
    const req = new NextRequest("http://localhost/api/recommendations/mood?key=mind_bender");
    await GET(req);
    expect(mockMoodEngine).toHaveBeenCalledWith(expect.anything(), "mind_bender");
  });

  it("returns 500 when moodEngine throws", async () => {
    mockMoodEngine.mockRejectedValue(new Error("TMDb down"));
    const req = new NextRequest("http://localhost/api/recommendations/mood?key=feel_good");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("TMDb down");
  });

  it("accepts all valid mood keys", async () => {
    for (const key of MOOD_KEYS) {
      const req = new NextRequest(`http://localhost/api/recommendations/mood?key=${key}`);
      const res = await GET(req);
      expect(res.status).toBe(200);
    }
  });
});
