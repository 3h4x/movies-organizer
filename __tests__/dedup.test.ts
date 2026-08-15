// tamtam inspected 2026-05-21
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";
import { dedupeMoviesByTmdbId, mergeMovies } from "@/lib/dedup";

const TEST_DB = path.join(__dirname, "test-dedup.db");

function makeMovie(
  db: Database.Database,
  overrides: Partial<Parameters<typeof insertMovie>[1]> = {},
) {
  return insertMovie(db, {
    title: overrides.title ?? "T",
    year: overrides.year ?? 2000,
    genre: null,
    director: null,
    rating: null,
    poster_url: null,
    source: null,
    imdb_id: null,
    tmdb_id: null,
    type: "movie",
    ...overrides,
  });
}

// insertMovie auto-dedupes by tmdb_id and title+year. These tests need
// pre-existing duplicate rows, so write them via raw inserts that bypass
// the helper's dedup.
function insertRaw(db: Database.Database, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => fields[k]);
  const result = db
    .prepare(`INSERT INTO movies (${keys.join(", ")}) VALUES (${placeholders})`)
    .run(...(values as (string | number | null)[]));
  return Number(result.lastInsertRowid);
}

describe("dedupeMoviesByTmdbId", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("merges two rows sharing a tmdb_id, keeping the one with a file_path", () => {
    const filmwebId = insertRaw(db, {
      title: "Amores perros",
      year: 2000,
      source: "filmweb",
      tmdb_id: 55,
      user_rating: 9.0,
      rating: 7.8,
      rated_at: "2010-10-20",
      filmweb_id: 31040,
      filmweb_url: "https://filmweb.pl/x",
      pl_title: "Amores perros",
    });
    const tmdbId = insertRaw(db, {
      title: "Amores Perros",
      year: 2000,
      source: "tmdb",
      tmdb_id: 55,
      user_rating: 7.0,
      rating: 7.6,
      file_path: "/Volumes/video/Movies/Amores Perros/AP.mp4",
    });

    const result = dedupeMoviesByTmdbId(db);

    expect(result.groupsMerged).toBe(1);
    expect(result.rowsRemoved).toBe(1);
    expect(result.failures).toEqual([]);

    const remaining = db
      .prepare("SELECT id, title, file_path, user_rating, rating, filmweb_id, rated_at FROM movies WHERE tmdb_id = 55")
      .all() as {
      id: number;
      title: string;
      file_path: string | null;
      user_rating: number | null;
      rating: number | null;
      filmweb_id: number | null;
      rated_at: string | null;
    }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(tmdbId);
    expect(remaining[0].file_path).toBe("/Volumes/video/Movies/Amores Perros/AP.mp4");
    // user_rating: max(9.0, 7.0) = 9.0
    expect(remaining[0].user_rating).toBe(9.0);
    // global rating: max(7.6, 7.8)
    expect(remaining[0].rating).toBe(7.8);
    // pulled forward from filmweb row
    expect(remaining[0].filmweb_id).toBe(31040);
    expect(remaining[0].rated_at).toBe("2010-10-20");

    const gone = db.prepare("SELECT id FROM movies WHERE id = ?").get(filmwebId);
    expect(gone).toBeUndefined();
  });

  it("leaves rows without duplicates untouched", () => {
    makeMovie(db, { title: "Solo", year: 2000, tmdb_id: 100 });
    const before = db.prepare("SELECT COUNT(*) as c FROM movies").get() as { c: number };

    const result = dedupeMoviesByTmdbId(db);

    expect(result.groupsMerged).toBe(0);
    expect(result.rowsRemoved).toBe(0);
    const after = db.prepare("SELECT COUNT(*) as c FROM movies").get() as { c: number };
    expect(after.c).toBe(before.c);
  });

  it("merges three rows into one canonical row", () => {
    insertRaw(db, { title: "A", year: 2000, source: "filmweb", tmdb_id: 77, user_rating: 8 });
    insertRaw(db, { title: "A", year: 2000, source: "tmdb", tmdb_id: 77, user_rating: 5 });
    insertRaw(db, {
      title: "A",
      year: 2000,
      source: "tmdb",
      tmdb_id: 77,
      file_path: "/x/a.mp4",
    });

    const result = dedupeMoviesByTmdbId(db);

    expect(result.rowsRemoved).toBe(2);
    const remaining = db
      .prepare("SELECT id, file_path, user_rating FROM movies WHERE tmdb_id = 77")
      .all() as { id: number; file_path: string | null; user_rating: number | null }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].file_path).toBe("/x/a.mp4");
    expect(remaining[0].user_rating).toBe(8);
  });

  it("ignores rows with null tmdb_id", () => {
    insertRaw(db, { title: "X", year: 1999, source: "filmweb", tmdb_id: null });
    insertRaw(db, { title: "X", year: 1999, source: "tmdb", tmdb_id: null });

    const result = dedupeMoviesByTmdbId(db);

    expect(result.groupsMerged).toBe(0);
    const remaining = db.prepare("SELECT COUNT(*) as c FROM movies").get() as { c: number };
    expect(remaining.c).toBe(2);
  });

  it("moves source.file_path into extra_files when both rows have a file_path", () => {
    insertRaw(db, {
      title: "B",
      year: 2001,
      source: "tmdb",
      tmdb_id: 200,
      file_path: "/x/b1.mp4",
    });
    insertRaw(db, {
      title: "B",
      year: 2001,
      source: "tmdb",
      tmdb_id: 200,
      file_path: "/x/b2.mp4",
      user_rating: 9, // ensure this becomes the canonical target (higher rating among file-bearing rows)
    });

    const result = dedupeMoviesByTmdbId(db);

    expect(result.rowsRemoved).toBe(1);
    const remaining = db
      .prepare("SELECT file_path, extra_files FROM movies WHERE tmdb_id = 200")
      .all() as { file_path: string | null; extra_files: string | null }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].file_path).toBe("/x/b2.mp4");
    const extras: string[] = JSON.parse(remaining[0].extra_files ?? "[]");
    expect(extras).toContain("/x/b1.mp4");
  });
});

describe("mergeMovies", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns 400 for invalid IDs", () => {
    const r = mergeMovies(db, 0, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("returns 404 when a row is missing", () => {
    const id = makeMovie(db, { title: "T", year: 2000 });
    const r = mergeMovies(db, id, 99999);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});
