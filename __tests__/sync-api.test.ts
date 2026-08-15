// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/lib/scanner", () => ({
  scanDirectoryGenerator: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  searchTmdb: vi.fn(),
}));

import { POST } from "@/app/api/sync/route";
import { getDb, setSetting } from "@/lib/db";
import { scanDirectoryGenerator } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-sync-api.db");

async function readNDJSON(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("sync API route", () => {
  let db: Database.Database;
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db);
    existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(scanDirectoryGenerator).mockReturnValue((function* () {})());
    vi.mocked(searchTmdb).mockResolvedValue([]);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    existsSyncSpy.mockRestore();
    vi.resetAllMocks();
  });

  it("returns 400 when no library_path is configured", async () => {
    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/library path/i);
  });

  it("returns 404 when library path does not exist on disk", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/missing/path');
    existsSyncSpy.mockReturnValue(false);

    const res = await POST();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("streams ndjson with scan_complete and complete events when no files found", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue((function* () {})());

    const res = await POST();
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");

    const events = await readNDJSON(res);
    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
    expect(complete!.added).toBe(0);
    expect(complete!.detached).toBe(0);
    expect(complete!.total).toBe(0);
  });

  it("adds new file via TMDb search when no existing match", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Inception.2010.mkv",
          filePath: "/movies/Inception.2010.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi, Thriller",
        rating: 8.8,
        poster_url: null,
        imdb_id: "tt1375666",
        tmdb_id: 27205,
      },
    ]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(0);

    const movies = db.prepare("SELECT * FROM movies").all() as { title: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
  });

  it("links file to existing movie with matching title+year and no file_path", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Inception.2010.mkv",
          filePath: "/movies/Inception.2010.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);

    const movies = db.prepare("SELECT * FROM movies").all() as { file_path: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].file_path).toBe("/movies/Inception.2010.mkv");
  });

  it("adds file as local entry when TMDb search returns no results", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "UnknownFilm.2005.mkv",
          filePath: "/movies/UnknownFilm.2005.mkv",
          parsedTitle: "UnknownFilm",
          parsedYear: 2005,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.added).toBe(1);
    expect(complete!.failed).toBe(0);

    const movies = db.prepare("SELECT * FROM movies").all() as { source: string; title: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].source).toBe("local");
    expect(movies[0].title).toBe("UnknownFilm");
  });

  it("adds file as local entry when TMDb search throws", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "SomeFilm.2000.mkv",
          filePath: "/movies/SomeFilm.2000.mkv",
          parsedTitle: "SomeFilm",
          parsedYear: 2000,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockRejectedValue(new Error("TMDb down"));

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.added).toBe(1);
    expect(complete!.failed).toBe(1);
  });

  it("detaches missing files while preserving ratings and metadata", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Old Film",
      year: 1999,
      genre: "Drama",
      director: null,
      rating: 7.4,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: 1234,
      type: "movie",
      file_path: "/movies/OldFilm.1999.mkv",
      user_rating: 9,
      wishlist: 1,
      filmweb_id: 5678,
      filmweb_url: "https://filmweb.example/old-film",
      cda_url: "https://cda.example/old-film",
      pl_title: "Stary Film",
      description: "Preserve me",
    });

    // Scanner finds no files — the old file is gone
    vi.mocked(scanDirectoryGenerator).mockReturnValue((function* () {})());

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.detached).toBe(1);

    const movies = db.prepare(
      "SELECT title, file_path, extra_files, video_metadata, user_rating, rating, wishlist, tmdb_id, filmweb_id, filmweb_url, cda_url, pl_title, description FROM movies",
    ).all() as Array<{
      title: string;
      file_path: string | null;
      extra_files: string | null;
      video_metadata: string | null;
      user_rating: number | null;
      rating: number | null;
      wishlist: number;
      tmdb_id: number | null;
      filmweb_id: number | null;
      filmweb_url: string | null;
      cda_url: string | null;
      pl_title: string | null;
      description: string | null;
    }>;
    expect(movies).toHaveLength(1);
    expect(movies[0]).toMatchObject({
      title: "Old Film",
      file_path: null,
      extra_files: null,
      video_metadata: null,
      user_rating: 9,
      rating: 7.4,
      wishlist: 1,
      tmdb_id: 1234,
      filmweb_id: 5678,
      filmweb_url: "https://filmweb.example/old-film",
      cda_url: "https://cda.example/old-film",
      pl_title: "Stary Film",
      description: "Preserve me",
    });
  });

  it("does not remove movies already in extra_files on rescan", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, extra_files) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("Matrix", 1999, "tmdb", "movie", "/movies/Matrix.mkv", JSON.stringify(["/movies/Matrix.alt.mkv"]));

    // Scanner finds the primary file only
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Matrix.mkv",
          filePath: "/movies/Matrix.mkv",
          parsedTitle: "Matrix",
          parsedYear: 1999,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    // Primary file exists — movie should NOT be removed
    expect(complete!.detached).toBe(0);
  });

  it("prunes missing extra files and invalidates cached video metadata", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, extra_files, video_metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "Matrix",
      1999,
      "tmdb",
      "movie",
      "/movies/Matrix.mkv",
      JSON.stringify(["/movies/Matrix.alt.mkv", "/movies/Matrix.deleted.mkv"]),
      JSON.stringify({
        duration: 8000,
        extra_files: [
          { path: "/movies/Matrix.alt.mkv", duration: 8001 },
          { path: "/movies/Matrix.deleted.mkv", duration: 8002 },
        ],
      }),
    );

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Matrix.mkv",
          filePath: "/movies/Matrix.mkv",
          parsedTitle: "Matrix",
          parsedYear: 1999,
        };
        yield {
          filename: "Matrix.alt.mkv",
          filePath: "/movies/Matrix.alt.mkv",
          parsedTitle: "Matrix",
          parsedYear: 1999,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.detached).toBe(0);

    const row = db.prepare(
      "SELECT extra_files, video_metadata FROM movies",
    ).get() as {
      extra_files: string | null;
      video_metadata: string | null;
    };
    expect(JSON.parse(row.extra_files ?? "[]")).toEqual([
      "/movies/Matrix.alt.mkv",
    ]);
    expect(row.video_metadata).toBeNull();
  });

  it("promotes an existing extra file when the primary path is missing", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, extra_files, video_metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "Matrix",
      1999,
      "tmdb",
      "movie",
      "/movies/Matrix.mkv",
      JSON.stringify(["/movies/Matrix.alt.mkv"]),
      '{"duration":8000}',
    );

    vi.mocked(scanDirectoryGenerator).mockImplementation(
      () =>
        (function* () {
          yield {
            filename: "Matrix.alt.mkv",
            filePath: "/movies/Matrix.alt.mkv",
            parsedTitle: "Matrix",
            parsedYear: 1999,
          };
        })(),
    );

    const firstRes = await POST();
    const firstEvents = await readNDJSON(firstRes);
    const firstComplete = firstEvents.find((e) => e.type === "complete");
    expect(firstComplete!.detached).toBe(0);

    const promoted = db.prepare(
      "SELECT file_path, extra_files, video_metadata FROM movies",
    ).all() as Array<{
      file_path: string | null;
      extra_files: string | null;
      video_metadata: string | null;
    }>;
    expect(promoted).toHaveLength(1);
    expect(promoted[0]).toMatchObject({
      file_path: "/movies/Matrix.alt.mkv",
      extra_files: null,
      video_metadata: null,
    });

    const secondRes = await POST();
    const secondEvents = await readNDJSON(secondRes);
    const secondComplete = secondEvents.find((e) => e.type === "complete");
    expect(secondComplete!.detached).toBe(0);
    expect(secondComplete!.added).toBe(0);
    expect(searchTmdb).not.toHaveBeenCalled();

    const movies = db.prepare("SELECT id FROM movies").all();
    expect(movies).toHaveLength(1);
  });

  it("links to existing pathless row with year=NULL (year IS ? handles NULL)", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    // Filmweb-imported wishlist row with no year and no file_path
    db.prepare(
      "INSERT INTO movies (title, year, source, type, wishlist) VALUES (?, NULL, ?, ?, 1)",
    ).run("Mystery Film", "filmweb", "movie");

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Mystery.Film.mkv",
          filePath: "/movies/Mystery.Film.mkv",
          parsedTitle: "Mystery Film",
          parsedYear: null,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);

    const movies = db.prepare("SELECT * FROM movies").all() as { file_path: string; source: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].file_path).toBe("/movies/Mystery.Film.mkv");
    expect(movies[0].source).toBe("filmweb");
  });

  it("links scanned file to existing pathless row by tmdb_id when filename uses an alt title", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    // Wishlist row stored under Polish title — matches by tmdb_id, not by filename title
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Adwokat",
      year: 2013,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 109091,
      type: "movie",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "The.Counselor.2013.mkv",
          filePath: "/movies/The.Counselor.2013.mkv",
          parsedTitle: "The Counselor",
          parsedYear: 2013,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      { title: "The Counselor", year: 2013, genre: "Drama", rating: 5.3, poster_url: null, imdb_id: "tt2193215", tmdb_id: 109091 },
    ]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);

    const movies = db.prepare(
      "SELECT title, file_path, genre, rating, imdb_id FROM movies",
    ).all() as Array<{
      title: string;
      file_path: string;
      genre: string | null;
      rating: number | null;
      imdb_id: string | null;
    }>;
    expect(movies).toHaveLength(1);
    expect(movies[0]).toMatchObject({
      title: "Adwokat",
      file_path: "/movies/The.Counselor.2013.mkv",
      genre: "Drama",
      rating: 5.3,
      imdb_id: "tt2193215",
    });
  });

  it("enriches a linked pathless row with TMDb metadata while preserving user-owned fields", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, "library_path", "/movies");
    db.prepare(
      "INSERT INTO movies (title, year, source, type, user_rating, wishlist, filmweb_id, filmweb_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "The Counselor",
      null,
      "filmweb",
      "movie",
      9,
      1,
      12345,
      "https://filmweb.example/the-counselor",
    );

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "The.Counselor.2013.mkv",
          filePath: "/movies/The.Counselor.2013.mkv",
          parsedTitle: "The Counselor",
          parsedYear: 2013,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "The Counselor",
        year: 2013,
        genre: "Drama",
        rating: 5.3,
        poster_url: "/poster.jpg",
        imdb_id: "tt2193215",
        tmdb_id: 109091,
      },
    ]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);

    const row = db.prepare(
      "SELECT year, file_path, tmdb_id, imdb_id, genre, rating, poster_url, user_rating, wishlist, filmweb_id, filmweb_url FROM movies WHERE title = ?",
    ).get("The Counselor") as {
      year: number | null;
      file_path: string | null;
      tmdb_id: number | null;
      imdb_id: string | null;
      genre: string | null;
      rating: number | null;
      poster_url: string | null;
      user_rating: number | null;
      wishlist: number;
      filmweb_id: number | null;
      filmweb_url: string | null;
    };
    expect(row).toMatchObject({
      year: 2013,
      file_path: "/movies/The.Counselor.2013.mkv",
      tmdb_id: 109091,
      imdb_id: "tt2193215",
      genre: "Drama",
      rating: 5.3,
      poster_url: "/poster.jpg",
      user_rating: 9,
      wishlist: 1,
      filmweb_id: 12345,
      filmweb_url: "https://filmweb.example/the-counselor",
    });
  });

  it("links to existing pathless row by title+year when TMDb throws (no duplicate local row)", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Some Film",
      year: 2000,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Some.Film.2000.mkv",
          filePath: "/movies/Some.Film.2000.mkv",
          parsedTitle: "Some Film",
          parsedYear: 2000,
        };
      })(),
    );
    // searchTmdb is not consulted — fast path links first

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);

    const movies = db.prepare("SELECT * FROM movies").all() as { source: string; file_path: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].source).toBe("filmweb");
    expect(movies[0].file_path).toBe("/movies/Some.Film.2000.mkv");
  });

  it("does not enrich a linked pathless row from a far-off TMDb fallback result", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, "library_path", "/movies");
    db.prepare(
      "INSERT INTO movies (title, year, source, type, wishlist) VALUES (?, ?, ?, ?, ?)",
    ).run("Spider-Man: Homecoming", 2017, "filmweb", "movie", 1);

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Spider.Man.Homecoming.2018.1080p.mkv",
          filePath: "/movies/Spider.Man.Homecoming.2018.1080p.mkv",
          parsedTitle: "Spider Man Homecoming",
          parsedYear: 2018,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Spider-Man: No Way Home",
        year: 2021,
        genre: "Action",
        rating: 8.2,
        poster_url: "/spider-man-no-way-home.jpg",
        imdb_id: "tt10872600",
        tmdb_id: 634649,
      },
    ]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);

    const row = db.prepare(
      "SELECT file_path, tmdb_id, imdb_id, genre, rating, poster_url, wishlist FROM movies WHERE title = ?",
    ).get("Spider-Man: Homecoming") as {
      file_path: string | null;
      tmdb_id: number | null;
      imdb_id: string | null;
      genre: string | null;
      rating: number | null;
      poster_url: string | null;
      wishlist: number;
    };
    expect(row).toMatchObject({
      file_path: "/movies/Spider.Man.Homecoming.2018.1080p.mkv",
      tmdb_id: null,
      imdb_id: null,
      genre: null,
      rating: null,
      poster_url: null,
      wishlist: 1,
    });
  });

  it("counts fallback TMDb merges into existing pathless rows as linked, not added", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, "library_path", "/movies");
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Adwokat",
      year: 2013,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: 109091,
      type: "movie",
      wishlist: 1,
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Bad.Filename.2013.mkv",
          filePath: "/movies/Bad.Filename.2013.mkv",
          parsedTitle: "Bad Filename",
          parsedYear: 2013,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "The Counselor",
        year: 2013,
        genre: "Drama",
        rating: 5.3,
        poster_url: "/poster.jpg",
        imdb_id: "tt2193215",
        tmdb_id: 109091,
      },
    ]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);

    const rows = db.prepare(
      "SELECT title, file_path, tmdb_id, genre, rating, poster_url, wishlist FROM movies",
    ).all() as Array<{
      title: string;
      file_path: string | null;
      tmdb_id: number | null;
      genre: string | null;
      rating: number | null;
      poster_url: string | null;
      wishlist: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Adwokat",
      file_path: "/movies/Bad.Filename.2013.mkv",
      tmdb_id: 109091,
      genre: "Drama",
      rating: 5.3,
      poster_url: "/poster.jpg",
      wishlist: 1,
    });
  });

  it("emits scanning progress events during phase 1", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        for (let i = 0; i < 3; i++) {
          yield {
            filename: `Film${i}.mkv`,
            filePath: `/movies/Film${i}.mkv`,
            parsedTitle: `Film${i}`,
            parsedYear: 2000 + i,
          };
        }
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const scanningEvents = events.filter((e) => e.type === "scanning");
    expect(scanningEvents.length).toBeGreaterThanOrEqual(1);

    const scanComplete = events.find((e) => e.type === "scan_complete");
    expect(scanComplete).toBeDefined();
    expect(scanComplete!.total).toBe(3);
  });

  it("counts unchanged files correctly when all known", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Known",
      year: 2000,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      file_path: "/movies/Known.2000.mkv",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Known.2000.mkv",
          filePath: "/movies/Known.2000.mkv",
          parsedTitle: "Known",
          parsedYear: 2000,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const scanComplete = events.find((e) => e.type === "scan_complete");
    expect(scanComplete!.unchanged).toBe(1);
    expect(scanComplete!.new_files).toBe(0);
  });
});
