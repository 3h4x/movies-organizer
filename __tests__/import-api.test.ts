// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getSetting } from "@/lib/db";

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

import { POST } from "@/app/api/import/route";
import { getDb } from "@/lib/db";
import { scanDirectoryGenerator } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-import.db");

// Helper: collect all NDJSON lines from a streaming Response
async function readNDJSON(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/import", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("import API route", () => {
  let db: Database.Database;
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    existsSyncSpy.mockRestore();
    vi.clearAllMocks();
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it("returns 400 when path is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/path/i);
  });

  it("returns 400 when path is not a string", async () => {
    const res = await POST(makeRequest({ path: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when directory does not exist", async () => {
    existsSyncSpy.mockReturnValue(false);
    const res = await POST(makeRequest({ path: "/nonexistent/dir" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  // ── Streaming behaviour ─────────────────────────────────────────────────────

  it("streams NDJSON with content-type application/x-ndjson", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {})() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
  });

  it("emits complete event with zero counts for an empty directory", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {})() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete).toBeDefined();
    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(0);
    expect(complete!.skipped).toBe(0);
    expect(complete!.failed).toBe(0);
    expect(complete!.total).toBe(0);
  });

  it("emits discovery and progress events for each file found", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.8,
        poster_url: null,
        tmdb_id: 27205,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const types = lines.map((l) => l.type);

    expect(types).toContain("discovery");
    expect(types).toContain("progress");
    expect(types).toContain("complete");
  });

  it("counts added=1 when TMDb match is found for a new file", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.8,
        poster_url: null,
        tmdb_id: 27205,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(0);
    expect(complete!.skipped).toBe(0);
    expect(complete!.failed).toBe(0);
  });

  it("counts added=1 with source=local when no TMDb match found", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Unknown Film (2099)/unknown.mkv",
          filename: "unknown.mkv",
          parsedTitle: "Unknown Film",
          parsedYear: 2099,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(0);
    expect(complete!.failed).toBe(0);
  });

  it("counts skipped=1 for a file that is already in the library", async () => {
    // Pre-insert the movie so it's already in the DB
    const { insertMovie } = await import("@/lib/db");
    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
      file_path: "/movies/Inception (2010)/inception.mkv",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.skipped).toBe(1);
    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(0);
  });

  it("counts failed=1 when TMDb throws an error", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Film (2020)/film.mkv",
          filename: "film.mkv",
          parsedTitle: "Film",
          parsedYear: 2020,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockRejectedValue(new Error("Network error"));

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.failed).toBe(1);
    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(0);
  });

  // ── Year-proximity matching ─────────────────────────────────────────────────

  it("accepts a TMDb result whose year is within ±1 of parsedYear", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Dune (2021)/dune.mkv",
          filename: "dune.mkv",
          parsedTitle: "Dune",
          parsedYear: 2021,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    // TMDb returns year=2022 (1 off) — should still match
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Dune: Part One",
        year: 2022,
        genre: "Sci-Fi",
        rating: 8.0,
        poster_url: null,
        tmdb_id: 438631,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(0);
    expect(complete!.failed).toBe(0);

    const row = db
      .prepare("SELECT title, year FROM movies WHERE tmdb_id = 438631")
      .get() as { title: string; year: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.title).toBe("Dune: Part One");
  });

  it("falls back to first TMDb result when no result matches parsedYear", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Alien (1979)/alien.mkv",
          filename: "alien.mkv",
          parsedTitle: "Alien",
          parsedYear: 1979,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    // Returns a result with year far off — should fall back to first result
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Alien: Covenant",
        year: 2017,
        genre: "Horror",
        rating: 6.4,
        poster_url: null,
        tmdb_id: 395992,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(0);

    const row = db
      .prepare("SELECT tmdb_id FROM movies WHERE tmdb_id = 395992")
      .get() as { tmdb_id: number } | undefined;
    expect(row).toBeDefined();
  });

  it("accepts any TMDb result when parsedYear is null", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Casablanca/casablanca.mkv",
          filename: "casablanca.mkv",
          parsedTitle: "Casablanca",
          parsedYear: null,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Casablanca",
        year: 1942,
        genre: "Drama, Romance",
        rating: 8.5,
        poster_url: null,
        tmdb_id: 289,
        imdb_id: "tt0034583",
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(0);

    const row = db
      .prepare("SELECT tmdb_id FROM movies WHERE tmdb_id = 289")
      .get() as { tmdb_id: number } | undefined;
    expect(row).toBeDefined();
  });

  // ── Settings persistence ────────────────────────────────────────────────────

  it("saves the import path as library_path in settings", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {})() as ReturnType<typeof scanDirectoryGenerator>,
    );

    await POST(makeRequest({ path: "/movies/library" }));

    const stored = getSetting(db, "library_path");
    expect(stored).toBe("/movies/library");
  });

  // ── Pathless-row linking ────────────────────────────────────────────────────

  it("links a metadata-poor pathless row and enriches it from TMDb", async () => {
    // Pre-insert a pathless Filmweb row (no file_path, no TMDb metadata)
    db.prepare(
      "INSERT INTO movies (title, year, source, type) VALUES ('Inception', 2010, 'filmweb', 'movie')",
    ).run();

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.4,
        poster_url: "https://image.tmdb.org/t/p/w300/inception.jpg",
        tmdb_id: 27205,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);
    expect(complete!.skipped).toBe(0);
    // The row was missing genre/rating/poster/tmdb_id, so TMDb is consulted to fill them.
    expect(searchTmdb).toHaveBeenCalled();

    const row = db
      .prepare(
        "SELECT file_path, genre, rating, poster_url, tmdb_id FROM movies WHERE title = 'Inception'",
      )
      .get() as {
      file_path: string;
      genre: string | null;
      rating: number | null;
      poster_url: string | null;
      tmdb_id: number | null;
    };
    expect(row.file_path).toBe("/movies/Inception (2010)/inception.mkv");
    expect(row.genre).toBe("Sci-Fi");
    expect(row.rating).toBe(8.4);
    expect(row.tmdb_id).toBe(27205);
  });

  it("does not call TMDb when the linked pathless row already has full metadata", async () => {
    // Enrichment must converge: a row that already carries every field the TMDb
    // search can supply is linked on the fast path and never re-queried.
    db.prepare(
      "INSERT INTO movies (title, year, source, type, genre, rating, poster_url, tmdb_id) VALUES ('Inception', 2010, 'filmweb', 'movie', 'Sci-Fi', 8.4, 'https://image.tmdb.org/t/p/w300/inception.jpg', 27205)",
    ).run();

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);
    expect(searchTmdb).not.toHaveBeenCalled();

    const row = db
      .prepare("SELECT file_path FROM movies WHERE title = 'Inception'")
      .get() as { file_path: string };
    expect(row.file_path).toBe("/movies/Inception (2010)/inception.mkv");
  });

  it("counts linked=1 when a pathless row matches by tmdb_id returned from TMDb", async () => {
    // Pre-insert a pathless row with a tmdb_id (e.g., from wishlist)
    db.prepare(
      "INSERT INTO movies (title, year, source, tmdb_id, type) VALUES ('Dune', 2021, 'filmweb', 438631, 'movie')",
    ).run();

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Dune Part One/dune.mkv",
          filename: "dune.mkv",
          parsedTitle: "Dune",
          parsedYear: 2022,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Dune: Part One",
        year: 2021,
        genre: "Sci-Fi",
        rating: 8.0,
        poster_url: null,
        tmdb_id: 438631,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);
  });

  // ── Multi-file summary ──────────────────────────────────────────────────────

  it("totals added + skipped + failed correctly across multiple files", async () => {
    const { insertMovie } = await import("@/lib/db");
    insertMovie(db, {
      title: "Already Here",
      year: 2000,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      file_path: "/movies/already.mkv",
    });
    insertMovie(db, {
      title: "Linked Film",
      year: 2021,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      wishlist: 1,
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield { filePath: "/movies/already.mkv", filename: "already.mkv", parsedTitle: "Already Here", parsedYear: 2000 };
        yield { filePath: "/movies/new.mkv", filename: "new.mkv", parsedTitle: "New Film", parsedYear: 2023 };
        yield { filePath: "/movies/linked.mkv", filename: "linked.mkv", parsedTitle: "Linked Film", parsedYear: 2021 };
        yield { filePath: "/movies/broken.mkv", filename: "broken.mkv", parsedTitle: "Broken", parsedYear: 2022 };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb)
      .mockResolvedValueOnce([{ title: "New Film", year: 2023, genre: "Action", rating: 7.0, poster_url: null, tmdb_id: 999, imdb_id: null }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("timeout"));

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.total).toBe(4);
    expect(complete!.skipped).toBe(1);
    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(1);
    expect(complete!.failed).toBe(1);
  });

  it("links a scanned file to an existing pathless row by tmdb_id", async () => {
    const { insertMovie } = await import("@/lib/db");
    insertMovie(db, {
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
      wishlist: 1,
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/The.Counselor.2013.mkv",
          filename: "The.Counselor.2013.mkv",
          parsedTitle: "The Counselor",
          parsedYear: 2013,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "The Counselor",
        year: 2013,
        genre: "Drama",
        rating: 5.3,
        poster_url: null,
        tmdb_id: 109091,
        imdb_id: "tt2193215",
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((line) => line.type === "complete");

    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(1);
    expect(complete!.skipped).toBe(0);

    const rows = db.prepare(
      "SELECT title, file_path, wishlist, genre, rating, imdb_id FROM movies",
    ).all() as Array<{
      title: string;
      file_path: string | null;
      wishlist: number;
      genre: string | null;
      rating: number | null;
      imdb_id: string | null;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Adwokat",
      file_path: "/movies/The.Counselor.2013.mkv",
      wishlist: 1,
      genre: "Drama",
      rating: 5.3,
      imdb_id: "tt2193215",
    });
  });

  it("enriches a linked pathless row with TMDb metadata while preserving user-owned fields", async () => {
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
          filePath: "/movies/The.Counselor.2013.mkv",
          filename: "The.Counselor.2013.mkv",
          parsedTitle: "The Counselor",
          parsedYear: 2013,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "The Counselor",
        year: 2013,
        genre: "Drama",
        rating: 5.3,
        poster_url: "/poster.jpg",
        tmdb_id: 109091,
        imdb_id: "tt2193215",
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((line) => line.type === "complete");

    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(1);

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

  it("links a scanned file to an existing normalized-title pathless row within ±1 year", async () => {
    const { insertMovie } = await import("@/lib/db");
    insertMovie(db, {
      title: "Spider-Man: Homecoming",
      year: 2017,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      wishlist: 1,
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Spider.Man.Homecoming.2018.1080p.mkv",
          filename: "Spider.Man.Homecoming.2018.1080p.mkv",
          parsedTitle: "Spider Man Homecoming",
          parsedYear: 2018,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );
    vi.mocked(searchTmdb).mockResolvedValue([]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((line) => line.type === "complete");

    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(1);

    const rows = db.prepare(
      "SELECT title, file_path, wishlist FROM movies",
    ).all() as Array<{
      title: string;
      file_path: string | null;
      wishlist: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Spider-Man: Homecoming",
      file_path: "/movies/Spider.Man.Homecoming.2018.1080p.mkv",
      wishlist: 1,
    });
  });

  it("preserves existing Filmweb and wishlist fields when import links to a pathless row", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, user_rating, wishlist, filmweb_id, filmweb_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "Inception",
      2010,
      "filmweb",
      "movie",
      9,
      1,
      12345,
      "https://filmweb.example/inception",
      "2001-01-01 00:00:00",
    );

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception.2010.mkv",
          filename: "Inception.2010.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((line) => line.type === "complete");

    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(1);

    const row = db.prepare(
      "SELECT file_path, user_rating, wishlist, filmweb_id, filmweb_url, created_at FROM movies WHERE title = ?",
    ).get("Inception") as {
      file_path: string | null;
      user_rating: number | null;
      wishlist: number;
      filmweb_id: number | null;
      filmweb_url: string | null;
      created_at: string;
    };
    expect(row.file_path).toBe("/movies/Inception.2010.mkv");
    expect(row.user_rating).toBe(9);
    expect(row.wishlist).toBe(1);
    expect(row.filmweb_id).toBe(12345);
    expect(row.filmweb_url).toBe("https://filmweb.example/inception");
    expect(row.created_at).not.toBe("2001-01-01 00:00:00");
  });

  it("does not enrich a linked pathless row from a far-off TMDb fallback result", async () => {
    db.prepare(
      "INSERT INTO movies (title, year, source, type, wishlist) VALUES (?, ?, ?, ?, ?)",
    ).run("Alien", 1979, "filmweb", "movie", 1);

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Alien.1979.mkv",
          filename: "Alien.1979.mkv",
          parsedTitle: "Alien",
          parsedYear: 1979,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Alien: Covenant",
        year: 2017,
        genre: "Horror, Sci-Fi",
        rating: 6.1,
        poster_url: "/alien-covenant.jpg",
        tmdb_id: 126889,
        imdb_id: "tt2316204",
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((line) => line.type === "complete");

    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(1);

    const row = db.prepare(
      "SELECT file_path, tmdb_id, imdb_id, genre, rating, poster_url, wishlist FROM movies WHERE title = ?",
    ).get("Alien") as {
      file_path: string | null;
      tmdb_id: number | null;
      imdb_id: string | null;
      genre: string | null;
      rating: number | null;
      poster_url: string | null;
      wishlist: number;
    };
    expect(row).toMatchObject({
      file_path: "/movies/Alien.1979.mkv",
      tmdb_id: null,
      imdb_id: null,
      genre: null,
      rating: null,
      poster_url: null,
      wishlist: 1,
    });
  });

  it("counts fallback TMDb merges into existing pathless rows as linked, not added", async () => {
    const { insertMovie } = await import("@/lib/db");
    insertMovie(db, {
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
          filePath: "/movies/Bad.Filename.2013.mkv",
          filename: "Bad.Filename.2013.mkv",
          parsedTitle: "Bad Filename",
          parsedYear: 2013,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "The Counselor",
        year: 2013,
        genre: "Drama",
        rating: 5.3,
        poster_url: "/poster.jpg",
        tmdb_id: 109091,
        imdb_id: "tt2193215",
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((line) => line.type === "complete");

    expect(complete!.added).toBe(0);
    expect(complete!.linked).toBe(1);

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
});
