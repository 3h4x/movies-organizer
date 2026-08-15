// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

const {
  mockExistsSync,
  mockUnlinkSync,
  mockRmSync,
  mockRmdirSync,
  mockReaddirSync,
  mockLstatSync,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockRmdirSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockLstatSync: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
      unlinkSync: mockUnlinkSync,
      rmSync: mockRmSync,
      rmdirSync: mockRmdirSync,
      readdirSync: mockReaddirSync,
      lstatSync: mockLstatSync,
      promises: {
        ...actual.promises,
        readFile: vi.fn().mockRejectedValue(new Error("not used")),
      },
    },
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
    rmSync: mockRmSync,
    rmdirSync: mockRmdirSync,
    readdirSync: mockReaddirSync,
    lstatSync: mockLstatSync,
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { DELETE } from "@/app/api/movies/[id]/full/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-full-delete-api.db");
const LIBRARY_ROOT = "/movies";

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function deleteReq(id: number, qs?: string) {
  const url = `http://localhost/api/movies/${id}/full${qs ? `?${qs}` : ""}`;
  return new NextRequest(url, { method: "DELETE" });
}

describe("movies/[id]/full DELETE handler", () => {
  let db: Database.Database;

  function insertWithFile(filePath: string) {
    const id = insertMovie(db, {
      title: "Test Movie",
      year: 2020,
      genre: "Drama",
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      file_path: filePath,
    });
    return id;
  }

  function setLibraryRoot(root: string) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("library_path", root);
  }

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    setLibraryRoot(LIBRARY_ROOT);
    mockExistsSync.mockReturnValue(true);
    mockUnlinkSync.mockReturnValue(undefined);
    mockRmSync.mockReturnValue(undefined);
    mockRmdirSync.mockReturnValue(undefined);
    mockReaddirSync.mockReturnValue([]);
  });

  afterEach(() => {
    db.close();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    } catch {}
    vi.resetAllMocks();
  });

  it("returns 404 for non-existent movie", async () => {
    const res = await DELETE(deleteReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("deletes movie from database when no file_path", async () => {
    const id = insertMovie(db, {
      title: "No File Movie",
      year: 2020,
      genre: "Drama",
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const still = db.prepare("SELECT id FROM movies WHERE id = ?").get(id);
    expect(still).toBeUndefined();
  });

  it("deletes only the file when movie is directly in library root", async () => {
    const filePath = `${LIBRARY_ROOT}/somemovie.mkv`;
    const id = insertWithFile(filePath);

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockUnlinkSync).toHaveBeenCalledWith(filePath);
    expect(mockRmSync).not.toHaveBeenCalled();
    const still = db.prepare("SELECT id FROM movies WHERE id = ?").get(id);
    expect(still).toBeUndefined();
  });

  it("deletes whole folder when movie is in a subdirectory of library root", async () => {
    const filePath = `${LIBRARY_ROOT}/Inception.2010/Inception.2010.mkv`;
    const id = insertWithFile(filePath);

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockRmSync).toHaveBeenCalledWith(
      path.dirname(filePath),
      expect.objectContaining({ recursive: true }),
    );
    const still = db.prepare("SELECT id FROM movies WHERE id = ?").get(id);
    expect(still).toBeUndefined();
  });

  it("refuses to delete protected folder names", async () => {
    // LIBRARY_ROOT is /movies; parent dir is /movies/movies (folder named "movies" which is protected)
    const filePath = `${LIBRARY_ROOT}/movies/somefile.mkv`;
    const id = insertWithFile(filePath);

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/protected/i);
  });

  it("preserves DB entry and clears file_path when disk_only=1", async () => {
    const filePath = `${LIBRARY_ROOT}/somemovie.mkv`;
    const id = insertWithFile(filePath);

    const res = await DELETE(deleteReq(id, "disk_only=1"), makeParams(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const row = db.prepare("SELECT file_path FROM movies WHERE id = ?").get(id) as { file_path: string | null } | undefined;
    expect(row).toBeDefined();
    expect(row!.file_path).toBeNull();
  });

  it("clears extra_files and video_metadata when disk_only=1", async () => {
    const filePath = `${LIBRARY_ROOT}/somemovie.mkv`;
    const id = insertWithFile(filePath);
    db.prepare("UPDATE movies SET extra_files = ?, video_metadata = ? WHERE id = ?").run(
      JSON.stringify([`${LIBRARY_ROOT}/somemovie.part2.mkv`]),
      JSON.stringify({ format: "mkv" }),
      id,
    );

    const res = await DELETE(deleteReq(id, "disk_only=1"), makeParams(id));
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT file_path, extra_files, video_metadata FROM movies WHERE id = ?").get(id) as {
      file_path: string | null;
      extra_files: string | null;
      video_metadata: string | null;
    } | undefined;
    expect(row).toBeDefined();
    expect(row!.file_path).toBeNull();
    expect(row!.extra_files).toBeNull();
    expect(row!.video_metadata).toBeNull();
  });

  it("skips file deletion when parent dir is outside library root", async () => {
    const filePath = "/other/location/somemovie.mkv";
    const id = insertWithFile(filePath);

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
    expect(mockRmSync).not.toHaveBeenCalled();
    const still = db.prepare("SELECT id FROM movies WHERE id = ?").get(id);
    expect(still).toBeUndefined();
  });

  it("also deletes extra_files when movie is in library root", async () => {
    const filePath = `${LIBRARY_ROOT}/somemovie.mkv`;
    const extraFile = `${LIBRARY_ROOT}/somemovie.part2.mkv`;
    const id = insertWithFile(filePath);
    db.prepare("UPDATE movies SET extra_files = ? WHERE id = ?").run(JSON.stringify([extraFile]), id);

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    expect(mockUnlinkSync).toHaveBeenCalledWith(filePath);
    expect(mockUnlinkSync).toHaveBeenCalledWith(extraFile);
  });

  it("also deletes companion subtitle files when movie is in library root", async () => {
    const filePath = `${LIBRARY_ROOT}/somemovie.mkv`;
    const srtPath = `${LIBRARY_ROOT}/somemovie.srt`;
    const assPath = `${LIBRARY_ROOT}/somemovie.ass`;
    const id = insertWithFile(filePath);

    // existsSync: movie file + srt exist, .ass and others do not
    mockExistsSync.mockImplementation((p: string) => {
      return p === filePath || p === srtPath;
    });

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    expect(mockUnlinkSync).toHaveBeenCalledWith(filePath);
    expect(mockUnlinkSync).toHaveBeenCalledWith(srtPath);
    expect(mockUnlinkSync).not.toHaveBeenCalledWith(assPath);
  });

  it("recovers from ENOTEMPTY by manually clearing folder contents", async () => {
    const filePath = `${LIBRARY_ROOT}/Inception.2010/Inception.2010.mkv`;
    const parentDir = path.dirname(filePath);
    const id = insertWithFile(filePath);

    // Simulate: rmSync throws ENOTEMPTY, then files are present
    const enotempty = Object.assign(new Error("ENOTEMPTY"), { code: "ENOTEMPTY" });
    mockRmSync.mockImplementationOnce(() => { throw enotempty; });
    mockReaddirSync.mockReturnValue(["Inception.2010.mkv", "thumbs.db"] as unknown as ReturnType<typeof mockReaddirSync>);
    mockLstatSync.mockReturnValue({ isDirectory: () => false } as unknown as ReturnType<typeof mockLstatSync>);

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Should have tried to unlink each file in the directory
    expect(mockUnlinkSync).toHaveBeenCalledWith(path.join(parentDir, "Inception.2010.mkv"));
    expect(mockUnlinkSync).toHaveBeenCalledWith(path.join(parentDir, "thumbs.db"));
    // Then tried rmdirSync
    expect(mockRmdirSync).toHaveBeenCalledWith(parentDir);
  });

  it("recovers from ENOTEMPTY when directory contains a subdirectory", async () => {
    const filePath = `${LIBRARY_ROOT}/SomeMovie.2019/SomeMovie.2019.mkv`;
    const parentDir = path.dirname(filePath);
    const id = insertWithFile(filePath);

    const enotempty = Object.assign(new Error("ENOTEMPTY"), { code: "ENOTEMPTY" });
    mockRmSync
      .mockImplementationOnce(() => { throw enotempty; }) // first rmSync on parentDir throws
      .mockReturnValue(undefined); // subsequent rmSync (on subdir) succeeds

    mockReaddirSync.mockReturnValue(["Subs"] as unknown as ReturnType<typeof mockReaddirSync>);
    // The "Subs" entry is a directory
    mockLstatSync.mockReturnValue({ isDirectory: () => true } as unknown as ReturnType<typeof mockLstatSync>);

    const res = await DELETE(deleteReq(id), makeParams(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // rmSync should be called recursively on the subdirectory
    expect(mockRmSync).toHaveBeenCalledWith(
      path.join(parentDir, "Subs"),
      expect.objectContaining({ recursive: true }),
    );
    expect(mockRmdirSync).toHaveBeenCalledWith(parentDir);
  });

  it("continues to delete DB entry when ENOTEMPTY rmdirSync still fails with ENOTEMPTY", async () => {
    const filePath = `${LIBRARY_ROOT}/AnotherMovie.2020/AnotherMovie.2020.mkv`;
    const parentDir = path.dirname(filePath);
    const id = insertWithFile(filePath);

    const enotempty = Object.assign(new Error("ENOTEMPTY"), { code: "ENOTEMPTY" });
    mockRmSync.mockImplementationOnce(() => { throw enotempty; });
    mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof mockReaddirSync>);
    // Final rmdirSync also throws ENOTEMPTY (network share artifact)
    mockRmdirSync.mockImplementationOnce(() => { throw enotempty; });

    const res = await DELETE(deleteReq(id), makeParams(id));
    // Should still succeed — ENOTEMPTY on final rmdir is treated as non-fatal
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Movie should be deleted from DB
    const still = db.prepare("SELECT id FROM movies WHERE id = ?").get(id);
    expect(still).toBeUndefined();
  });
});
