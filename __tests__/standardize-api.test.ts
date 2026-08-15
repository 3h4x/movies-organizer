// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

const { mockExistsSync, mockMkdir, mockRename, mockReaddir, mockRm, mockStat } =
  vi.hoisted(() => ({
    mockExistsSync: vi.fn(),
    mockMkdir: vi.fn(),
    mockRename: vi.fn(),
    mockReaddir: vi.fn(),
    mockRm: vi.fn(),
    mockStat: vi.fn(),
  }));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: mockMkdir,
    rename: mockRename,
    readdir: mockReaddir,
    rm: mockRm,
    stat: mockStat,
  },
  mkdir: mockMkdir,
  rename: mockRename,
  readdir: mockReaddir,
  rm: mockRm,
  stat: mockStat,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
    },
    existsSync: mockExistsSync,
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST } from "@/app/api/movies/[id]/standardize/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-standardize-api.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function postReq(id: number, qs?: string) {
  const url = `http://localhost/api/movies/${id}/standardize${qs ? `?${qs}` : ""}`;
  return new NextRequest(url, { method: "POST" });
}

describe("movies/[id]/standardize POST handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockRm.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ size: 0 });
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it("returns 404 when movie is not found", async () => {
    const res = await POST(postReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when movie has no file_path", async () => {
    movieId = insertMovie(db, {
      title: "No Path",
      year: 2020,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file path/i);
  });

  it("returns 404 with FILE_NOT_FOUND code when file is missing from disk", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/library/old_folder/inception_old.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(false);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("FILE_NOT_FOUND");
  });

  it("removes DB entry when file is missing and delete_missing=true", async () => {
    movieId = insertMovie(db, {
      title: "Ghost Film",
      year: 2015,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/library/ghost_folder/Ghost Film.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(false);

    const res = await POST(
      postReq(movieId, "delete_missing=true"),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const row = db.prepare("SELECT * FROM movies WHERE id = ?").get(movieId);
    expect(row).toBeUndefined();
  });

  it("returns ok with 'already standard' when path matches standard format", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    // Path already matches standard format: Title [Year]/Title.ext
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/library/Inception [2010]/Inception.mkv",
      movieId,
    );

    // existsSync(oldPath) must return true to proceed past the missing-file check
    mockExistsSync.mockImplementation((p: string) =>
      p === "/library/Inception [2010]/Inception.mkv",
    );

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/already standard/i);
  });

  it("moves file and updates DB when path is not standard", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);
    expect(body.newTitle).toBe("Inception");

    const row = db
      .prepare("SELECT file_path, title, year FROM movies WHERE id = ?")
      .get(movieId) as { file_path: string; title: string; year: number };
    expect(row.file_path).toBe(expectedNewPath);
    expect(row.title).toBe("Inception");
    expect(row.year).toBe(2010);

    expect(mockMkdir).toHaveBeenCalledWith(
      "/library/Inception [2010]",
      expect.objectContaining({ recursive: true }),
    );
    expect(mockRename).toHaveBeenCalledWith(oldPath, expectedNewPath);
  });

  it("returns 409 when target file already exists on disk (collision)", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    const newPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    // Both old and new paths exist → collision
    mockExistsSync.mockImplementation(
      (p: string) => p === oldPath || p === newPath,
    );

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it("uses library_path setting as root when configured", async () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "library_path",
      "/mnt/media/Movies",
    );

    movieId = insertMovie(db, {
      title: "Dune",
      year: 2021,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 438631,
      type: "movie",
    });
    const oldPath = "/mnt/media/Movies/dune_2021_bluray/dune.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    const expectedNewPath = "/mnt/media/Movies/Dune [2021]/Dune.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    expect(mockMkdir).toHaveBeenCalledWith(
      "/mnt/media/Movies/Dune [2021]",
      expect.objectContaining({ recursive: true }),
    );
  });

  it("recovers when file already at standard path but DB not updated", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    // old path missing but new path exists (partial move, DB not updated)
    mockExistsSync.mockImplementation((p: string) => p === expectedNewPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(movieId) as { file_path: string };
    expect(row.file_path).toBe(expectedNewPath);
  });

  it("removes placeholder (no file_path) conflict entry and continues standardization", async () => {
    // Insert the movie to standardize (noisy title → cleans to "Inception")
    movieId = insertMovie(db, {
      title: "Inception 1080p BluRay",
      year: 2010,
      genre: null,
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/Inception.1080p.BluRay.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    // Insert a placeholder with the CLEAN title (same as what standardize will resolve to)
    // and no file_path. Use a different tmdb_id to avoid insertMovie deduplication.
    db.prepare(
      "INSERT INTO movies (title, year, genre, director, rating, source, type, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
    ).run("Inception", 2010, "Sci-Fi", "Christopher Nolan", 8.8, "recommendation", "movie");
    const placeholderRow = db
      .prepare("SELECT id FROM movies WHERE title = 'Inception' AND type = 'movie'")
      .get() as { id: number };
    const placeholderId = placeholderRow.id;

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    // Placeholder should be deleted
    const placeholder = db.prepare("SELECT id FROM movies WHERE id = ?").get(placeholderId);
    expect(placeholder).toBeUndefined();

    // Main movie should have been moved
    const row = db
      .prepare("SELECT file_path, title FROM movies WHERE id = ?")
      .get(movieId) as { file_path: string; title: string };
    expect(row.file_path).toBe(expectedNewPath);
    expect(row.title).toBe("Inception");
  });

  it("removes phantom conflict (file_path set but file missing on disk) and continues", async () => {
    movieId = insertMovie(db, {
      title: "Inception 4K Remux",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/old_4k/Inception.4K.REMUX.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    // Insert a conflict with a stale file_path that no longer exists on disk
    const phantomId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const phantomPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(phantomPath, phantomId);

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";

    // Old path exists; phantom path does NOT exist
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    // Phantom conflict should be deleted
    const phantom = db.prepare("SELECT id FROM movies WHERE id = ?").get(phantomId);
    expect(phantom).toBeUndefined();

    // Main movie gets updated path
    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(movieId) as { file_path: string };
    expect(row.file_path).toBe(expectedNewPath);
  });

  it("moves subtitle files alongside the movie file", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);
    // readdir returns the original movie file plus a subtitle file
    mockReaddir.mockResolvedValue(["inception_1080p.mkv", "inception_1080p.srt"]);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    // Subtitle should have been moved (renamed to .srt under new dir)
    const renameCalls = mockRename.mock.calls as [string, string][];
    const subCall = renameCalls.find(([, dst]) => dst.endsWith(".srt"));
    expect(subCall).toBeDefined();
    expect(subCall![0]).toBe("/library/old_folder/inception_1080p.srt");
    expect(subCall![1]).toBe("/library/Inception [2010]/Inception.srt");
  });

  it("deletes old directory after moving file to standard path", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_noisy_folder/inception_1080p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    mockExistsSync.mockImplementation((p: string) => p === oldPath);
    // readdir returns empty (no extra files to stat), so getDirSize returns 0 → eligible for deletion
    mockReaddir.mockResolvedValue([]);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);

    expect(mockRm).toHaveBeenCalledWith(
      "/library/old_noisy_folder",
      expect.objectContaining({ recursive: true, force: true }),
    );
  });

  it("detects CD1 file and moves sibling CD2 alongside", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/movies_folder/inception.cd1.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    const expectedNewPath = "/library/Inception [2010]/Inception CD1.mkv";
    const expectedSiblingPath = "/library/Inception [2010]/Inception CD2.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    // call #1 (CD grouping): readdir returns both CD files
    mockReaddir.mockResolvedValueOnce(["inception.cd1.mkv", "inception.cd2.mkv"]);
    // call #2 (subtitle scan): no subtitles
    mockReaddir.mockResolvedValueOnce([]);
    // call #3 (getDirSize with withFileTypes): empty dir
    mockReaddir.mockResolvedValueOnce([]);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    const renameCalls = mockRename.mock.calls as [string, string][];
    expect(renameCalls).toContainEqual([oldPath, expectedNewPath]);
    expect(renameCalls).toContainEqual([
      "/library/movies_folder/inception.cd2.mkv",
      expectedSiblingPath,
    ]);

    const row = db
      .prepare("SELECT extra_files FROM movies WHERE id = ?")
      .get(movieId) as { extra_files: string };
    const extra = JSON.parse(row.extra_files);
    expect(extra).toContain(expectedSiblingPath);
  });

  it("merges both-live conflict metadata into current movie and moves file", async () => {
    movieId = insertMovie(db, {
      title: "Inception 4K",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.0,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/messy_folder/Inception.4K.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    const conflictFilePath = "/library/other_folder/Inception.avi";
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, director, rating) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("Inception", 2010, "tmdb", "movie", conflictFilePath, "Christopher Nolan", 9.0);
    const conflictRow = db
      .prepare("SELECT id FROM movies WHERE file_path = ?")
      .get(conflictFilePath) as { id: number };
    const conflictId = conflictRow.id;

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    // oldPath and conflictPath both exist; expectedNewPath does not
    mockExistsSync.mockImplementation(
      (p: string) => p === oldPath || p === conflictFilePath,
    );
    mockReaddir.mockResolvedValueOnce([]); // subtitle scan
    mockReaddir.mockResolvedValueOnce([]); // getDirSize

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    // Conflict should be deleted (merged into movieId)
    const deleted = db.prepare("SELECT id FROM movies WHERE id = ?").get(conflictId);
    expect(deleted).toBeUndefined();

    // Movie gets merged metadata and new path
    const row = db
      .prepare("SELECT file_path, director, rating FROM movies WHERE id = ?")
      .get(movieId) as { file_path: string; director: string; rating: number };
    expect(row.file_path).toBe(expectedNewPath);
    expect(row.director).toBe("Christopher Nolan");
    expect(row.rating).toBe(9.0); // max of 8.0 and 9.0
  });

  it("recovery: merges current movie into conflict that already has the target path", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception.mkv";
    const newPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    // Conflict is already sitting at the exact target path
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, rating) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("Inception", 2010, "tmdb", "movie", newPath, 9.0);
    const conflictRow = db
      .prepare("SELECT id FROM movies WHERE file_path = ?")
      .get(newPath) as { id: number };
    const conflictId = conflictRow.id;

    // old path missing, new path exists (recovery mode)
    mockExistsSync.mockImplementation((p: string) => p === newPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mergedId).toBe(conflictId);
    expect(body.message).toMatch(/target already had path/i);

    // movieId deleted (merged into conflict)
    const deleted = db.prepare("SELECT id FROM movies WHERE id = ?").get(movieId);
    expect(deleted).toBeUndefined();

    // conflictId survives with merged rating (max of 7.0 and 9.0)
    const survivor = db
      .prepare("SELECT rating FROM movies WHERE id = ?")
      .get(conflictId) as { rating: number };
    expect(survivor).toBeDefined();
    expect(survivor.rating).toBe(9.0);
  });

  it("recovery: merges conflict into current when conflict path differs from target", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: 8.0,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception.mkv";
    const newPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    // Conflict at a different path (not the target)
    const conflictFilePath = "/library/some_other_path/Inception.mp4";
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, director) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("Inception", 2010, "tmdb", "movie", conflictFilePath, "Christopher Nolan");
    const conflictRow = db
      .prepare("SELECT id FROM movies WHERE file_path = ?")
      .get(conflictFilePath) as { id: number };
    const conflictId = conflictRow.id;

    // old path missing, new path exists (recovery mode)
    mockExistsSync.mockImplementation((p: string) => p === newPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/merged and DB updated/i);
    expect(body.newPath).toBe(newPath);

    // conflictId deleted (merged into movieId)
    const deleted = db.prepare("SELECT id FROM movies WHERE id = ?").get(conflictId);
    expect(deleted).toBeUndefined();

    // movieId updated with new path and merged metadata (director from conflict)
    const row = db
      .prepare("SELECT file_path, director FROM movies WHERE id = ?")
      .get(movieId) as { file_path: string; director: string };
    expect(row.file_path).toBe(newPath);
    expect(row.director).toBe("Christopher Nolan");
  });

  it("skips old directory deletion when remaining size exceeds 10 MB", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_720p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    mockExistsSync.mockImplementation((p: string) => p === oldPath);
    // subtitle scan: no subtitles
    mockReaddir.mockResolvedValueOnce([]);
    // getDirSize readdir (withFileTypes): one large leftover file
    mockReaddir.mockResolvedValueOnce([
      { name: "extras.mkv", isDirectory: () => false },
    ]);
    // stat returns 11 MB for that file
    mockStat.mockResolvedValueOnce({ size: 11 * 1024 * 1024 });

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // rm should NOT have been called
    expect(mockRm).not.toHaveBeenCalled();
  });

  it("returns 500 when file rename fails", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_720p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    mockExistsSync.mockImplementation((p: string) => p === oldPath);
    mockRename.mockRejectedValueOnce(new Error("EXDEV: cross-device link not permitted"));

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/cross-device/i);
  });
});
