// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  initDb,
  recordImpressions,
  getImpressionCounts,
} from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-rec-impressions.db");

describe("recordImpressions / getImpressionCounts", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("inserts a new row on first call", () => {
    recordImpressions(db, "hidden_gem", [100, 200]);
    const rows = db
      .prepare(
        "SELECT tmdb_id, engine, shown_count FROM recommendation_impressions ORDER BY tmdb_id",
      )
      .all() as { tmdb_id: number; engine: string; shown_count: number }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tmdb_id: 100, engine: "hidden_gem", shown_count: 1 });
    expect(rows[1]).toMatchObject({ tmdb_id: 200, engine: "hidden_gem", shown_count: 1 });
  });

  it("increments shown_count on subsequent calls for the same (tmdb_id, engine)", () => {
    recordImpressions(db, "hidden_gem", [100]);
    recordImpressions(db, "hidden_gem", [100, 200]);
    recordImpressions(db, "hidden_gem", [100]);

    const counts = getImpressionCounts(db, "hidden_gem", [100, 200]);
    expect(counts.get(100)).toBe(3);
    expect(counts.get(200)).toBe(1);
  });

  it("scopes counts by engine — same tmdb_id under different engines is tracked separately", () => {
    recordImpressions(db, "hidden_gem", [42]);
    recordImpressions(db, "hidden_gem", [42]);
    recordImpressions(db, "genre", [42]);

    expect(getImpressionCounts(db, "hidden_gem", [42]).get(42)).toBe(2);
    expect(getImpressionCounts(db, "genre", [42]).get(42)).toBe(1);
  });

  it("returns an empty map when given no tmdb_ids", () => {
    recordImpressions(db, "hidden_gem", [1, 2, 3]);
    expect(getImpressionCounts(db, "hidden_gem", [])).toEqual(new Map());
  });

  it("ignores impressions older than the decay window", () => {
    recordImpressions(db, "hidden_gem", [777]);
    // backdate the impression to 30 days ago
    const longAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    db.prepare(
      "UPDATE recommendation_impressions SET last_shown_at = ? WHERE tmdb_id = ?",
    ).run(longAgo, 777);

    expect(getImpressionCounts(db, "hidden_gem", [777]).get(777)).toBeUndefined();
    // wider window includes it
    expect(getImpressionCounts(db, "hidden_gem", [777], 60).get(777)).toBe(1);
  });

  it("no-ops when given an empty id list or empty engine", () => {
    recordImpressions(db, "hidden_gem", []);
    recordImpressions(db, "", [1, 2]);
    const cnt = db
      .prepare("SELECT COUNT(*) as c FROM recommendation_impressions")
      .get() as { c: number };
    expect(cnt.c).toBe(0);
  });
});

describe("hiddenGemEngine impression penalty", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.resetModules();
  });

  it("ranks a movie with shown_count >= 5 below an equally-rated movie with shown_count = 0", async () => {
    // Seed impressions for tmdb_id 100 (5 prior surfacings) and none for 200.
    recordImpressions(db, "hidden_gem", [100]);
    recordImpressions(db, "hidden_gem", [100]);
    recordImpressions(db, "hidden_gem", [100]);
    recordImpressions(db, "hidden_gem", [100]);
    recordImpressions(db, "hidden_gem", [100]);

    vi.doMock("@/lib/db", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/db")>();
      return { ...actual, getDb: () => db };
    });
    vi.doMock("@/lib/tmdb", () => ({
      discoverHiddenGems: vi.fn().mockResolvedValue([
        { tmdb_id: 100, title: "Stale Gem", year: 2010, genre: "Drama", rating: 7.5, poster_url: null, imdb_id: null },
        { tmdb_id: 200, title: "Fresh Gem", year: 2010, genre: "Drama", rating: 7.5, poster_url: null, imdb_id: null },
      ]),
      genreNameToId: vi.fn().mockReturnValue(null),
    }));

    const { hiddenGemEngine } = await import("@/lib/engines/hidden-gem");
    const { buildContext } = await import("@/lib/engines");
    const ctx = buildContext([], new Set());

    const groups = await hiddenGemEngine(ctx);
    expect(groups).toHaveLength(1);
    const order = groups[0].recommendations.map((r) => r.tmdb_id);
    expect(order).toEqual([200, 100]);
  });
});
