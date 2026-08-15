// tamtam inspected 2026-05-21
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";
import { linkToExistingPathlessRow } from "@/lib/pathless-row-link";
import type { ScannedFile } from "@/lib/scanner";

const TEST_DB = path.join(__dirname, "test-pathless-row-link.db");

function makeFile(overrides: Partial<ScannedFile> = {}): ScannedFile {
  return {
    filePath: "/movies/inception.mkv",
    filename: "inception.mkv",
    parsedTitle: "Inception",
    parsedYear: 2010,
    ...overrides,
  };
}

describe("linkToExistingPathlessRow", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns null when no pathless row exists", () => {
    const linked = linkToExistingPathlessRow(db, makeFile(), null);
    expect(linked).toBeNull();
  });

  it("returns null when a matching row already has a file_path", () => {
    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
      file_path: "/movies/other.mkv",
    });
    const linked = linkToExistingPathlessRow(db, makeFile(), { tmdb_id: 27205 });
    expect(linked).toBeNull();
  });

  it("links by tmdb_id and returns the linked row id", () => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO movies (title, year, source, tmdb_id, type) VALUES (?, ?, 'filmweb', ?, 'movie')",
      )
      .run("Inception", 2010, 27205);
    const id = Number(lastInsertRowid);

    const linked = linkToExistingPathlessRow(db, makeFile(), { tmdb_id: 27205 });
    expect(linked).toBe(id);

    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(id) as { file_path: string };
    expect(row.file_path).toBe("/movies/inception.mkv");
  });

  it("links by exact LOWER(title) + year match when no tmdb_id provided", () => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO movies (title, year, source, type) VALUES (?, ?, 'filmweb', 'movie')",
      )
      .run("INCEPTION", 2010);
    const id = Number(lastInsertRowid);

    const linked = linkToExistingPathlessRow(db, makeFile(), null);
    expect(linked).toBe(id);

    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(id) as { file_path: string };
    expect(row.file_path).toBe("/movies/inception.mkv");
  });

  it("links by cleanTitle + year within ±1 when no exact match", () => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO movies (title, year, source, type) VALUES (?, ?, 'filmweb', 'movie')",
      )
      .run("Inception", 2011);
    const id = Number(lastInsertRowid);

    const linked = linkToExistingPathlessRow(db, makeFile(), null);
    expect(linked).toBe(id);

    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(id) as { file_path: string };
    expect(row.file_path).toBe("/movies/inception.mkv");
  });

  it("does not link when year difference exceeds ±1", () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type) VALUES (?, ?, 'filmweb', 'movie')",
    ).run("Inception", 2015);

    const linked = linkToExistingPathlessRow(db, makeFile(), null);
    expect(linked).toBeNull();
  });

  it("links by tmdb_id before falling through to title match", () => {
    // Two pathless rows: one matching title, one matching tmdb_id
    const { lastInsertRowid: titleId } = db
      .prepare(
        "INSERT INTO movies (title, year, source, type) VALUES (?, ?, 'filmweb', 'movie')",
      )
      .run("Inception", 2010);
    const { lastInsertRowid: tmdbId } = db
      .prepare(
        "INSERT INTO movies (title, year, source, tmdb_id, type) VALUES (?, ?, 'filmweb', ?, 'movie')",
      )
      .run("Inception", 2010, 27205);

    linkToExistingPathlessRow(db, makeFile(), { tmdb_id: 27205 });

    // The tmdb_id row should be linked, not the title row
    const titleRow = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(Number(titleId)) as { file_path: string | null };
    const tmdbRow = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(Number(tmdbId)) as { file_path: string | null };
    expect(tmdbRow.file_path).toBe("/movies/inception.mkv");
    expect(titleRow.file_path).toBeNull();
  });

  it("links when parsedYear is null and title matches (no year constraint)", () => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO movies (title, year, source, type) VALUES (?, ?, 'filmweb', 'movie')",
      )
      .run("Casablanca", 1942);
    const id = Number(lastInsertRowid);

    const file = makeFile({ parsedTitle: "Casablanca", parsedYear: null, filePath: "/movies/casablanca.mkv" });
    const linked = linkToExistingPathlessRow(db, file, null);
    expect(linked).toBe(id);

    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(id) as { file_path: string };
    expect(row.file_path).toBe("/movies/casablanca.mkv");
  });
});
