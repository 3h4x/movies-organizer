// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST } from "@/app/api/movies/merge/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-merge.db");

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/movies/merge", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function insertTestMovie(
  db: Database.Database,
  overrides: Partial<Parameters<typeof insertMovie>[1]> = {},
) {
  return insertMovie(db, {
    title: "Test Movie",
    year: 2020,
    genre: "Drama",
    director: "Director",
    rating: 7.0,
    poster_url: null,
    source: "tmdb",
    imdb_id: null,
    tmdb_id: null,
    type: "movie",
    ...overrides,
  });
}

describe("POST /api/movies/merge", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    // Add optional migration columns used by the merge route
    try { db.exec("ALTER TABLE movies ADD COLUMN user_rating REAL"); } catch {}
    try { db.exec("ALTER TABLE movies ADD COLUMN description TEXT"); } catch {}
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 when sourceId is missing", async () => {
    const res = await POST(makeRequest({ targetId: 2 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 when targetId is missing", async () => {
    const res = await POST(makeRequest({ sourceId: 1 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 when sourceId === targetId", async () => {
    const res = await POST(makeRequest({ sourceId: 1, targetId: 1 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 404 when source movie does not exist", async () => {
    const targetId = insertTestMovie(db);
    const res = await POST(makeRequest({ sourceId: 9999, targetId }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it("returns 404 when target movie does not exist", async () => {
    const sourceId = insertTestMovie(db);
    const res = await POST(makeRequest({ sourceId, targetId: 9999 }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  // ── Success: basic merge ──────────────────────────────────────────────────

  it("deletes the source and keeps the target on success", async () => {
    const sourceId = insertTestMovie(db, { title: "Source Movie" });
    const targetId = insertTestMovie(db, { title: "Target Movie" });

    const res = await POST(makeRequest({ sourceId, targetId }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.targetId).toBe(targetId);

    const remaining = db
      .prepare("SELECT id FROM movies")
      .all() as { id: number }[];
    expect(remaining.map((r) => r.id)).not.toContain(sourceId);
    expect(remaining.map((r) => r.id)).toContain(targetId);
  });

  // ── Field merging strategies ──────────────────────────────────────────────

  it("copies tmdb_id from source to target when target has none", async () => {
    const sourceId = insertTestMovie(db, { title: "Source", tmdb_id: 12345 });
    const targetId = insertTestMovie(db, { title: "Target", tmdb_id: null });

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT tmdb_id FROM movies WHERE id = ?")
      .get(targetId) as { tmdb_id: number };
    expect(target.tmdb_id).toBe(12345);
  });

  it("keeps target tmdb_id when both source and target have a value", async () => {
    const sourceId = insertTestMovie(db, { title: "Source", tmdb_id: 111 });
    const targetId = insertTestMovie(db, { title: "Target", tmdb_id: 222 });

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT tmdb_id FROM movies WHERE id = ?")
      .get(targetId) as { tmdb_id: number };
    expect(target.tmdb_id).toBe(222);
  });

  it("takes the higher user_rating from source and target", async () => {
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });
    db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(
      9,
      sourceId,
    );
    db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(
      6,
      targetId,
    );

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT user_rating FROM movies WHERE id = ?")
      .get(targetId) as { user_rating: number };
    expect(target.user_rating).toBe(9);
  });

  it("uses the longer description", async () => {
    const shortDesc = "Short.";
    const longDesc = "This is a much longer description with more detail.";
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });
    db.prepare("UPDATE movies SET description = ? WHERE id = ?").run(
      shortDesc,
      sourceId,
    );
    db.prepare("UPDATE movies SET description = ? WHERE id = ?").run(
      longDesc,
      targetId,
    );

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT description FROM movies WHERE id = ?")
      .get(targetId) as { description: string };
    expect(target.description).toBe(longDesc);
  });

  it("merges genres from both movies without duplicates", async () => {
    const sourceId = insertTestMovie(db, {
      title: "Source",
      genre: "Action, Drama",
    });
    const targetId = insertTestMovie(db, {
      title: "Target",
      genre: "Drama, Sci-Fi",
    });

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT genre FROM movies WHERE id = ?")
      .get(targetId) as { genre: string };
    const genres = target.genre.split(", ");
    expect(genres).toContain("Action");
    expect(genres).toContain("Drama");
    expect(genres).toContain("Sci-Fi");
    // No duplicates
    expect(genres.filter((g) => g === "Drama")).toHaveLength(1);
  });

  it("takes the higher global rating from source and target", async () => {
    const sourceId = insertTestMovie(db, { title: "Source", rating: 9.2 });
    const targetId = insertTestMovie(db, { title: "Target", rating: 7.5 });

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT rating FROM movies WHERE id = ?")
      .get(targetId) as { rating: number };
    expect(target.rating).toBe(9.2);
  });

  it("copies poster_url from source when target has none", async () => {
    const sourceId = insertTestMovie(db, {
      title: "Source",
      poster_url: "https://image.tmdb.org/poster.jpg",
    });
    const targetId = insertTestMovie(db, {
      title: "Target",
      poster_url: null,
    });

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT poster_url FROM movies WHERE id = ?")
      .get(targetId) as { poster_url: string };
    expect(target.poster_url).toBe("https://image.tmdb.org/poster.jpg");
  });

  it("copies file_path from source to target when target has none", async () => {
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/movies/source.mkv",
      sourceId,
    );

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(targetId) as { file_path: string };
    expect(target.file_path).toBe("/movies/source.mkv");
    // source must be deleted
    const src = db.prepare("SELECT id FROM movies WHERE id = ?").get(sourceId);
    expect(src).toBeUndefined();
  });

  it("merges extra_files from both source and target without duplicates", async () => {
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });
    db.prepare("UPDATE movies SET extra_files = ? WHERE id = ?").run(
      JSON.stringify(["/movies/bonus.mkv", "/movies/shared.mkv"]),
      sourceId,
    );
    db.prepare("UPDATE movies SET extra_files = ? WHERE id = ?").run(
      JSON.stringify(["/movies/shared.mkv", "/movies/featurette.mkv"]),
      targetId,
    );

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT extra_files FROM movies WHERE id = ?")
      .get(targetId) as { extra_files: string };
    const extras: string[] = JSON.parse(target.extra_files);
    expect(extras).toContain("/movies/bonus.mkv");
    expect(extras).toContain("/movies/shared.mkv");
    expect(extras).toContain("/movies/featurette.mkv");
    // No duplicates
    expect(extras.filter((e) => e === "/movies/shared.mkv")).toHaveLength(1);
  });

  it("propagates wishlist=1 from source to target when target has none", async () => {
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });
    db.prepare("UPDATE movies SET wishlist = 1 WHERE id = ?").run(sourceId);

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT wishlist FROM movies WHERE id = ?")
      .get(targetId) as { wishlist: number };
    expect(target.wishlist).toBe(1);
  });

  it("keeps target wishlist=1 when source has no wishlist", async () => {
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });
    db.prepare("UPDATE movies SET wishlist = 1 WHERE id = ?").run(targetId);

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT wishlist FROM movies WHERE id = ?")
      .get(targetId) as { wishlist: number };
    expect(target.wishlist).toBe(1);
  });

  it("copies director from source when target director is null", async () => {
    const sourceId = insertTestMovie(db, {
      title: "Source",
      director: "Kubrick",
    });
    const targetId = insertTestMovie(db, { title: "Target", director: null });

    await POST(makeRequest({ sourceId, targetId }));

    const target = db
      .prepare("SELECT director FROM movies WHERE id = ?")
      .get(targetId) as { director: string };
    expect(target.director).toBe("Kubrick");
  });

  it("returns ok and targetId in response body on success", async () => {
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });

    const res = await POST(makeRequest({ sourceId, targetId }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.targetId).toBe(targetId);
    expect(data.message).toMatch(/merged/i);
  });

  it("returns 500 when the DB transaction throws", async () => {
    const sourceId = insertTestMovie(db, { title: "Source" });
    const targetId = insertTestMovie(db, { title: "Target" });

    vi.spyOn(db, "transaction").mockImplementationOnce(
      // Cast needed: the stub omits Transaction-specific methods (deferred, etc.)
      (() => {
        return () => {
          throw new Error("SQLITE_READONLY: attempt to write a readonly database");
        };
      }) as any,
    );

    const res = await POST(makeRequest({ sourceId, targetId }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/SQLITE_READONLY/);
  });
});
