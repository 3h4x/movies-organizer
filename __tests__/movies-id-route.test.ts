// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

// Mock heavy external dependencies — the PATCH/DELETE handlers don't use them,
// but the GET handler does; mocking avoids side-effects when the module loads.
vi.mock("@/lib/tmdb", () => ({
  getTmdbMovieDetails: vi.fn(),
  searchTmdb: vi.fn().mockResolvedValue([]),
  getMovieLocalized: vi.fn().mockResolvedValue({ pl_title: null, description: null }),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: null, stdout: string, stderr: string) => void) => cb(null, "{}", "")),
}));

vi.mock("util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("util")>();
  return {
    ...actual,
    promisify: vi.fn(() =>
      vi.fn<() => Promise<never>>().mockRejectedValue(new Error("ffprobe not available in tests")),
    ),
  };
});

// Patch only getDb so the handler uses our in-memory database.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET, PATCH, DELETE } from "@/app/api/movies/[id]/route";
import { getDb } from "@/lib/db";
import { getTmdbMovieDetails, searchTmdb, getMovieLocalized } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-movies-id-route.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function patchReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/movies/1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("movies/[id] PATCH handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("updates user_rating and returns the updated movie", async () => {
    const res = await PATCH(patchReq({ user_rating: 9 }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_rating).toBe(9);
    expect(body.id).toBe(movieId);
  });

  it("auto-sets rated_at when user_rating is provided without rated_at", async () => {
    const before = Date.now();
    const res = await PATCH(patchReq({ user_rating: 7 }), makeParams(movieId));
    const after = Date.now();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ratedAt = new Date(body.rated_at).getTime();
    expect(ratedAt).toBeGreaterThanOrEqual(before);
    expect(ratedAt).toBeLessThanOrEqual(after + 1000);
  });

  it("clears rated_at when user_rating is set to null", async () => {
    // First give it a rating.
    await PATCH(patchReq({ user_rating: 7 }), makeParams(movieId));
    // Now clear it.
    const res = await PATCH(patchReq({ user_rating: null }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_rating).toBeNull();
    expect(body.rated_at).toBeNull();
  });

  it("respects an explicit rated_at value when provided alongside user_rating", async () => {
    const explicit = "2024-06-15T12:00:00.000Z";
    const res = await PATCH(
      patchReq({ user_rating: 8, rated_at: explicit }),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rated_at).toBe(explicit);
  });

  it("updates multiple allowed fields in one request", async () => {
    const res = await PATCH(
      patchReq({ title: "Inception (2010)", year: 2010, genre: "Sci-Fi, Thriller" }),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Inception (2010)");
    expect(body.genre).toBe("Sci-Fi, Thriller");
  });

  it("returns 400 when no valid fields are provided", async () => {
    const res = await PATCH(
      patchReq({ unknown_field: "value", another_bad: 123 }),
      makeParams(movieId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no valid fields/i);
  });

  it("returns 400 when user_rating is below 1", async () => {
    const res = await PATCH(patchReq({ user_rating: 0 }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/user_rating/i);
  });

  it("returns 400 when user_rating is above 10", async () => {
    const res = await PATCH(patchReq({ user_rating: 11 }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/user_rating/i);
  });

  it("returns 400 when user_rating is a non-numeric string", async () => {
    const res = await PATCH(patchReq({ user_rating: "great" }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/user_rating/i);
  });

  it("accepts user_rating of null (clearing the rating)", async () => {
    await PATCH(patchReq({ user_rating: 7 }), makeParams(movieId));
    const res = await PATCH(patchReq({ user_rating: null }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_rating).toBeNull();
  });

  it("returns 400 when wishlist is not 0 or 1", async () => {
    const res = await PATCH(patchReq({ wishlist: 2 }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/wishlist/i);
  });

  it("returns 400 when wishlist is a string", async () => {
    const res = await PATCH(patchReq({ wishlist: "yes" }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/wishlist/i);
  });

  it("allows wishlist=null via PATCH (clears flag)", async () => {
    db.prepare("UPDATE movies SET wishlist = 1 WHERE id = ?").run(movieId);
    const res = await PATCH(patchReq({ wishlist: null }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wishlist).toBeNull();
  });

  it("returns 500 with error message and code when DB update throws", async () => {
    const dbError = Object.assign(new Error("SQLITE_CORRUPT: database disk image is malformed"), {
      code: "SQLITE_CORRUPT",
    });
    vi.spyOn(db, "prepare").mockImplementationOnce(() => {
      throw dbError;
    });

    const res = await PATCH(patchReq({ user_rating: 7 }), makeParams(movieId));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("SQLITE_CORRUPT: database disk image is malformed");
    expect(body.code).toBe("SQLITE_CORRUPT");
  });

  it("returns 404 for a non-existent movie id", async () => {
    const res = await PATCH(patchReq({ user_rating: 5 }), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when year is a non-numeric string", async () => {
    const res = await PATCH(patchReq({ year: "nineteen-eighty-four" }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year/i);
  });

  it("returns 400 when year is below 1888", async () => {
    const res = await PATCH(patchReq({ year: 1800 }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year/i);
  });

  it("returns 400 when year is above 2200", async () => {
    const res = await PATCH(patchReq({ year: 3000 }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year/i);
  });

  it("returns 400 when year is a float", async () => {
    const res = await PATCH(patchReq({ year: 2010.5 }), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year/i);
  });

  it("accepts a valid year update", async () => {
    const res = await PATCH(patchReq({ year: 1994 }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBe(1994);
  });

  it("accepts year=null to clear the year", async () => {
    const res = await PATCH(patchReq({ year: null }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBeNull();
  });

  it("ignores non-allowlisted fields in a mixed request", async () => {
    const res = await PATCH(
      patchReq({ user_rating: 6, malicious_field: "DROP TABLE movies" }),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_rating).toBe(6);
    // Confirm malicious_field was not persisted.
    expect(body).not.toHaveProperty("malicious_field");
  });

  it("sets wishlist flag via PATCH", async () => {
    const res = await PATCH(patchReq({ wishlist: 1 }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wishlist).toBe(1);

    const row = db.prepare("SELECT wishlist FROM movies WHERE id = ?").get(movieId) as { wishlist: number };
    expect(row.wishlist).toBe(1);
  });

  it("clears wishlist flag via PATCH", async () => {
    db.prepare("UPDATE movies SET wishlist = 1 WHERE id = ?").run(movieId);

    const res = await PATCH(patchReq({ wishlist: 0 }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wishlist).toBe(0);
  });
});

describe("movies/[id] DELETE handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    movieId = insertMovie(db, {
      title: "The Matrix",
      year: 1999,
      genre: "Sci-Fi",
      director: "The Wachowskis",
      rating: 8.7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 603,
      type: "movie",
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("deletes the movie and returns { ok: true }", async () => {
    const req = new NextRequest(`http://localhost/api/movies/${movieId}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Confirm it's gone from the DB.
    const row = db.prepare("SELECT * FROM movies WHERE id = ?").get(movieId);
    expect(row).toBeUndefined();
  });

  it("returns { ok: true } even for a non-existent id (idempotent)", async () => {
    const req = new NextRequest("http://localhost/api/movies/99999", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams(99999));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

describe("movies/[id] GET handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    movieId = insertMovie(db, {
      title: "Interstellar",
      year: 2014,
      genre: "Sci-Fi",
      director: null,
      rating: 8.6,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: 157336,
      type: "movie",
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  function getReq(id: number) {
    return new NextRequest(`http://localhost/api/movies/${id}`);
  }

  it("returns 404 for a non-existent movie", async () => {
    const res = await GET(getReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns movie data with null metadata when file_path is absent", async () => {
    // getTmdbMovieDetails returns credits so enrichment runs
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: "Christopher Nolan",
      actors: "Matthew McConaughey",
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.title).toBe("Interstellar");
    expect(body.metadata).toBeNull();
  });

  it("returns null metadata when file_path points to a missing file", async () => {
    const missingFilePath = path.join(__dirname, "missing-video-file.mkv");
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      missingFilePath,
      movieId,
    );

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: "Christopher Nolan",
      actors: "Matthew McConaughey",
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toBeNull();
  });

  it("returns null metadata when video_metadata contains invalid JSON", async () => {
    db.prepare("UPDATE movies SET video_metadata = ? WHERE id = ?").run(
      "not-valid-json{",
      movieId,
    );

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // JSON.parse fails silently; no file_path so ffprobe is not attempted
    expect(body.metadata).toBeNull();
  });

  it("returns parsed video_metadata from cached DB field", async () => {
    const cached = { format: "Matroska", duration: 10020, video: { codec: "h264" }, audio: [] };
    db.prepare("UPDATE movies SET video_metadata = ? WHERE id = ?").run(
      JSON.stringify(cached),
      movieId,
    );

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toMatchObject({ format: "Matroska", duration: 10020 });
  });

  it("enriches movie with TMDb credits when director is missing", async () => {
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: "Christopher Nolan",
      actors: "Matthew McConaughey, Anne Hathaway",
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.director).toBe("Christopher Nolan");
    expect(body.movie.actors).toBe("Matthew McConaughey, Anne Hathaway");

    // Verify the credits were persisted to the DB
    const row = db.prepare("SELECT director, writer, actors FROM movies WHERE id = ?").get(movieId) as { director: string; writer: string | null; actors: string };
    expect(row.director).toBe("Christopher Nolan");
    expect(row.actors).toBe("Matthew McConaughey, Anne Hathaway");
  });

  it("skips TMDb detail enrichment when credits and collection metadata are all set", async () => {
    db.prepare(
      "UPDATE movies SET director = ?, writer = ?, actors = ?, tmdb_collection_id = ?, tmdb_collection_name = ?, tmdb_collection_checked = ? WHERE id = ?",
    ).run(
      "Christopher Nolan",
      "Christopher Nolan",
      "Matthew McConaughey",
      119,
      "Interstellar Collection",
      1,
      movieId,
    );

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    expect(vi.mocked(getTmdbMovieDetails)).not.toHaveBeenCalled();
  });

  it("marks absent collection metadata as checked and does not refetch details", async () => {
    db.prepare(
      "UPDATE movies SET director = ?, writer = ?, actors = ? WHERE id = ?",
    ).run("Christopher Nolan", "Christopher Nolan", "Matthew McConaughey", movieId);
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: null,
      writer: null,
      actors: null,
      tmdb_collection_checked: true,
    });

    const first = await GET(getReq(movieId), makeParams(movieId));
    expect(first.status).toBe(200);
    const row = db
      .prepare("SELECT tmdb_collection_id, tmdb_collection_name, tmdb_collection_checked FROM movies WHERE id = ?")
      .get(movieId) as {
        tmdb_collection_id: number | null;
        tmdb_collection_name: string | null;
        tmdb_collection_checked: number;
      };
    expect(row.tmdb_collection_id).toBeNull();
    expect(row.tmdb_collection_name).toBeNull();
    expect(row.tmdb_collection_checked).toBe(1);

    const second = await GET(getReq(movieId), makeParams(movieId));
    expect(second.status).toBe(200);
    expect(vi.mocked(getTmdbMovieDetails)).toHaveBeenCalledTimes(1);
  });

  it("auto-links TMDb when tmdb_id is null and searchTmdb finds a match", async () => {
    // Insert a movie without tmdb_id
    const unlinkId = insertMovie(db, {
      title: "Dune",
      year: 2021,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 438631,
        title: "Dune",
        year: 2021,
        genre: "Sci-Fi",
        rating: 7.9,
        poster_url: "/poster.jpg",
        imdb_id: "tt1160419",
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Diuna",
      description: "Epic sci-fi saga.",
    });

    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.tmdb_id).toBe(438631);
    expect(body.movie.pl_title).toBe("Diuna");
    expect(body.movie.source).toBe("tmdb");

    // Verify persisted to DB
    const row = db.prepare("SELECT tmdb_id, pl_title, source FROM movies WHERE id = ?").get(unlinkId) as { tmdb_id: number; pl_title: string; source: string };
    expect(row.tmdb_id).toBe(438631);
    expect(row.source).toBe("tmdb");
  });

  it("skips auto-link when searchTmdb returns no results", async () => {
    const unlinkId = insertMovie(db, {
      title: "Obscure Film",
      year: 1985,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    // searchTmdb is already mocked to return [] by default
    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // tmdb_id should remain null
    expect(body.movie.tmdb_id).toBeNull();
    expect(vi.mocked(getTmdbMovieDetails)).not.toHaveBeenCalled();
  });

  it("falls back to results[0] when no exact title match during auto-link", async () => {
    const unlinkId = insertMovie(db, {
      title: "Blade Runner",
      year: 1982,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    // Return a result whose normalized title differs from the movie title
    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 78,
        title: "Blade Runner 2049",
        year: 2017,
        genre: "Sci-Fi",
        rating: 7.5,
        poster_url: "/br2049.jpg",
        imdb_id: "tt1856101",
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Łowca androidów 2049",
      description: "Sequel.",
    });

    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should have used results[0] as fallback
    expect(body.movie.tmdb_id).toBe(78);
    expect(body.movie.title).toBe("Blade Runner 2049");
    expect(body.movie.pl_title).toBe("Łowca androidów 2049");
    expect(body.movie.source).toBe("tmdb");
  });

  it("skips auto-link when getMovieLocalized throws", async () => {
    const unlinkId = insertMovie(db, {
      title: "Casablanca",
      year: 1942,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 289,
        title: "Casablanca",
        year: 1942,
        genre: "Drama",
        rating: 8.5,
        poster_url: "/casa.jpg",
        imdb_id: "tt0034583",
      },
    ]);
    vi.mocked(getMovieLocalized).mockRejectedValueOnce(new Error("localization service unavailable"));

    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // auto-link skipped due to error; tmdb_id stays null
    expect(body.movie.tmdb_id).toBeNull();
    expect(body.movie.source).toBe("manual");
  });

  it("returns metadata error object when file exists but ffprobe fails", async () => {
    // Use the TEST_DB path as a stand-in for a real existing file.
    // The promisify mock always rejects, so ffprobe throws → metadata error.
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(TEST_DB, movieId);

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toMatchObject({ error: expect.stringContaining("ffprobe") });
  });

  it("returns 200 with director=null when getTmdbMovieDetails throws during credits enrichment", async () => {
    // movieId has tmdb_id=157336 and director=null → enrichment path runs
    vi.mocked(getTmdbMovieDetails).mockRejectedValueOnce(new Error("TMDb API unreachable"));

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Error is caught internally; movie is still returned
    expect(body.movie).toBeDefined();
    expect(body.movie.director).toBeNull();
    // DB is unchanged
    const row = db.prepare("SELECT director FROM movies WHERE id = ?").get(movieId) as { director: string | null };
    expect(row.director).toBeNull();
  });

  it("persists TMDb collection metadata during detail enrichment", async () => {
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: null,
      writer: null,
      actors: null,
      tmdb_collection_id: 10,
      tmdb_collection_name: "Star Wars Collection",
      tmdb_collection_checked: true,
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.tmdb_collection_id).toBe(10);
    expect(body.movie.tmdb_collection_name).toBe("Star Wars Collection");

    const row = db
      .prepare("SELECT tmdb_collection_id, tmdb_collection_name, tmdb_collection_checked FROM movies WHERE id = ?")
      .get(movieId) as {
        tmdb_collection_id: number;
        tmdb_collection_name: string;
        tmdb_collection_checked: number;
      };
    expect(row.tmdb_collection_id).toBe(10);
    expect(row.tmdb_collection_name).toBe("Star Wars Collection");
    expect(row.tmdb_collection_checked).toBe(1);
  });

  it("enriches pl_title and description when movie has tmdb_id but both are missing", async () => {
    // movieId has tmdb_id=157336, no director (credits enrichment runs first), no pl_title/description
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Interstellar",
      description: "Podróż przez czerw.",
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.pl_title).toBe("Interstellar");
    expect(body.movie.description).toBe("Podróż przez czerw.");

    const row = db
      .prepare("SELECT pl_title, description FROM movies WHERE id = ?")
      .get(movieId) as { pl_title: string; description: string };
    expect(row.pl_title).toBe("Interstellar");
    expect(row.description).toBe("Podróż przez czerw.");
  });

  it("enriches only pl_title when description is already present", async () => {
    db.prepare("UPDATE movies SET description = ? WHERE id = ?").run(
      "Existing description",
      movieId,
    );

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Interstellar (PL)",
      description: "Should not overwrite existing",
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.pl_title).toBe("Interstellar (PL)");
    // description was already set — should not be overwritten
    expect(body.movie.description).toBe("Existing description");

    const row = db
      .prepare("SELECT pl_title, description FROM movies WHERE id = ?")
      .get(movieId) as { pl_title: string; description: string };
    expect(row.pl_title).toBe("Interstellar (PL)");
    expect(row.description).toBe("Existing description");
  });

  it("skips localized enrichment entirely when both pl_title and description are already set", async () => {
    db.prepare("UPDATE movies SET pl_title = ?, description = ? WHERE id = ?").run(
      "Interstellar (PL)",
      "Już opisany.",
      movieId,
    );

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    // getMovieLocalized should not have been called (only the auto-link mock was set, not this path)
    // Default mock returns null/null but we verify no extra call happened beyond credits
    expect(vi.mocked(getMovieLocalized)).not.toHaveBeenCalled();
  });

  it("returns 200 when getMovieLocalized throws during description/pl_title enrichment", async () => {
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });
    vi.mocked(getMovieLocalized).mockRejectedValueOnce(new Error("localization unavailable"));

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Movie is returned despite error; localized fields remain null
    expect(body.movie).toBeDefined();
    expect(body.movie.pl_title).toBeNull();
    expect(body.movie.description).toBeNull();
  });

  it("runs credits enrichment after successful auto-link in the same request", async () => {
    const unlinkId = insertMovie(db, {
      title: "Parasite",
      year: 2019,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    // auto-link resolves the tmdb_id
    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 496243,
        title: "Parasite",
        year: 2019,
        genre: "Thriller",
        rating: 8.5,
        poster_url: "/parasite.jpg",
        imdb_id: "tt6751668",
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({ pl_title: "Pasożyt", description: "Dark comedy thriller." });
    // after auto-link, credits enrichment runs for the newly acquired tmdb_id
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Bong Joon-ho",
      writer: "Bong Joon-ho",
      actors: "Song Kang-ho",
    });

    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.tmdb_id).toBe(496243);
    expect(body.movie.pl_title).toBe("Pasożyt");
    expect(body.movie.director).toBe("Bong Joon-ho");
    // Persisted to DB
    const row = db.prepare("SELECT director, tmdb_id FROM movies WHERE id = ?").get(unlinkId) as { director: string; tmdb_id: number };
    expect(row.director).toBe("Bong Joon-ho");
    expect(row.tmdb_id).toBe(496243);
  });

  it("re-attempts TMDb linking for CDA movie with pseudo-ID (no genre) and succeeds", async () => {
    // Movie added from CDA with a hash-based pseudo tmdb_id and no genre
    const cdaId = insertMovie(db, {
      title: "Popiełuszko",
      year: 2023,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: 1151563536,  // fake hashCode-based pseudo-ID
      type: "movie",
    });
    db.prepare("UPDATE movies SET cda_url = ? WHERE id = ?").run(
      "https://www.cda.pl/video/abc123/vfilm",
      cdaId,
    );

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 987654,
        title: "Popiełuszko",
        year: 2023,
        genre: "Drama, Biography",
        rating: 7.2,
        poster_url: "/pop.jpg",
        imdb_id: "tt123456",
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Popiełuszko. Wolność jest w nas",
      description: "Film biograficzny.",
    });
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Rafał Wieczyński",
      writer: null,
      actors: "Jacek Belowski",
    });

    const res = await GET(getReq(cdaId), makeParams(cdaId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.tmdb_id).toBe(987654);
    expect(body.movie.genre).toBe("Drama, Biography");
    expect(body.movie.director).toBe("Rafał Wieczyński");
    expect(body.movie.pl_title).toBe("Popiełuszko. Wolność jest w nas");

    // Pseudo-ID replaced in DB
    const row = db.prepare("SELECT tmdb_id, genre FROM movies WHERE id = ?").get(cdaId) as { tmdb_id: number; genre: string };
    expect(row.tmdb_id).toBe(987654);
    expect(row.genre).toBe("Drama, Biography");
  });

  it("skips credits/description enrichment when CDA pseudo-ID cannot be resolved", async () => {
    // Movie with pseudo-ID, no genre → auto-link finds nothing → enrichments must be skipped
    const cdaId = insertMovie(db, {
      title: "Obscure Polish Film",
      year: 2020,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: 999888777,  // another pseudo-ID
      type: "movie",
    });
    db.prepare("UPDATE movies SET cda_url = ? WHERE id = ?").run(
      "https://www.cda.pl/video/xyz/vfilm",
      cdaId,
    );

    // searchTmdb returns nothing — auto-link fails
    vi.mocked(searchTmdb).mockResolvedValueOnce([]);

    const res = await GET(getReq(cdaId), makeParams(cdaId));
    expect(res.status).toBe(200);
    // getTmdbMovieDetails and getMovieLocalized must NOT have been called (pseudo-ID still in place)
    expect(vi.mocked(getTmdbMovieDetails)).not.toHaveBeenCalled();
    expect(vi.mocked(getMovieLocalized)).not.toHaveBeenCalled();

    // DB unchanged
    const row = db.prepare("SELECT tmdb_id, genre FROM movies WHERE id = ?").get(cdaId) as { tmdb_id: number; genre: string | null };
    expect(row.tmdb_id).toBe(999888777);
    expect(row.genre).toBeNull();
  });

  it("dedup: merges cda_url onto canonical and deletes duplicate row on auto-link", async () => {
    // Canonical row already has the real TMDb ID
    const canonicalId = insertMovie(db, {
      title: "Parasite",
      year: 2019,
      genre: "Thriller, Drama",
      director: "Bong Joon-ho",
      rating: 8.5,
      poster_url: "https://image.tmdb.org/t/p/w300/canon.jpg",
      source: "tmdb",
      imdb_id: "tt6751668",
      tmdb_id: 496243,
      type: "movie",
    });

    // Duplicate CDA row: no genre, pseudo-style (tmdb_id absent triggers auto-link)
    const dupId = insertMovie(db, {
      title: "Pasożyt",
      year: 2019,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET cda_url = ? WHERE id = ?").run(
      "https://www.cda.pl/video/parasite123/vfilm",
      dupId,
    );

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 496243,
        title: "Parasite",
        year: 2019,
        genre: "Thriller, Drama",
        rating: 8.5,
        poster_url: "https://image.tmdb.org/t/p/w300/canon.jpg",
        imdb_id: "tt6751668",
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Pasożyt",
      description: "A Korean family schemes to infiltrate a wealthy household.",
    });

    const res = await GET(getReq(dupId), makeParams(dupId));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Response should be the canonical row's data
    expect(body.movie.id).toBe(canonicalId);
    expect(body.movie.title).toBe("Parasite");
    expect(body.movie.genre).toBe("Thriller, Drama");

    // Duplicate row must be deleted
    const dupRow = db.prepare("SELECT id FROM movies WHERE id = ?").get(dupId);
    expect(dupRow).toBeUndefined();

    // cda_url from duplicate should be on canonical
    const canonRow = db.prepare("SELECT cda_url FROM movies WHERE id = ?").get(canonicalId) as { cda_url: string };
    expect(canonRow.cda_url).toBe("https://www.cda.pl/video/parasite123/vfilm");
  });

  it("dedup: merges user_rating and wishlist from duplicate onto canonical when canonical lacks them", async () => {
    const canonicalId = insertMovie(db, {
      title: "Memories of Murder",
      year: 2003,
      genre: "Crime, Drama",
      director: "Bong Joon-ho",
      rating: 8.1,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 195,
      type: "movie",
    });

    const dupId = insertMovie(db, {
      title: "Wspomnienie morderstwa",
      year: 2003,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET user_rating = ?, wishlist = ? WHERE id = ?").run(8, 1, dupId);

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 195,
        title: "Memories of Murder",
        year: 2003,
        genre: "Crime, Drama",
        rating: 8.1,
        poster_url: null,
        imdb_id: null,
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({ pl_title: null, description: null });

    const res = await GET(getReq(dupId), makeParams(dupId));
    expect(res.status).toBe(200);

    const canonRow = db.prepare("SELECT user_rating, wishlist FROM movies WHERE id = ?").get(canonicalId) as { user_rating: number; wishlist: number };
    expect(canonRow.user_rating).toBe(8);
    expect(canonRow.wishlist).toBe(1);
  });

  it("dedup: updates recommended_movies poster_url when canonical has cda_url and bestMatch has poster", async () => {
    // Canonical row has cda_url — this is what the code will use to look up recommended_movies
    const canonicalId = insertMovie(db, {
      title: "The Handmaiden",
      year: 2016,
      genre: "Drama, Thriller",
      director: "Park Chan-wook",
      rating: 8.1,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 342472,
      type: "movie",
    });
    db.prepare("UPDATE movies SET cda_url = ? WHERE id = ?").run(
      "https://www.cda.pl/video/handmaiden/vfilm",
      canonicalId,
    );

    // A recommended_movies entry pointing at the same CDA URL but with no poster yet
    db.prepare(`
      INSERT INTO recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url, cda_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(342472, "cda", "CDA Premium", "The Handmaiden", 2016, "Drama", 8.1, null, "https://www.cda.pl/video/handmaiden/vfilm");

    // Duplicate CDA row that will trigger the dedup path
    const dupId = insertMovie(db, {
      title: "Służąca",
      year: 2016,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 342472,
        title: "The Handmaiden",
        year: 2016,
        genre: "Drama, Thriller",
        rating: 8.1,
        poster_url: "/handmaiden.jpg",
        imdb_id: null,
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({ pl_title: "Służąca", description: null });

    const res = await GET(getReq(dupId), makeParams(dupId));
    expect(res.status).toBe(200);

    // recommended_movies poster_url should now be set to bestMatch.poster_url
    const recRow = db
      .prepare("SELECT poster_url FROM recommended_movies WHERE cda_url = ?")
      .get("https://www.cda.pl/video/handmaiden/vfilm") as { poster_url: string };
    expect(recRow.poster_url).toBe("/handmaiden.jpg");

    // Canonical persisted, dup deleted
    const dupRow = db.prepare("SELECT id FROM movies WHERE id = ?").get(dupId);
    expect(dupRow).toBeUndefined();
    const canonRow = db.prepare("SELECT id FROM movies WHERE id = ?").get(canonicalId);
    expect(canonRow).toBeDefined();
  });

  it("dedup: skips recommended_movies update when canonical has no cda_url", async () => {
    // Canonical without cda_url — the UPDATE should not run
    const canonicalId = insertMovie(db, {
      title: "A Tale of Two Sisters",
      year: 2003,
      genre: "Horror",
      director: "Kim Jee-woon",
      rating: 7.4,
      poster_url: "/sisters.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 10590,
      type: "movie",
    });

    // Insert a recommended_movies row with a cda_url to confirm it is NOT updated
    db.prepare(`
      INSERT INTO recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url, cda_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(10590, "cda", "CDA Premium", "A Tale of Two Sisters", 2003, "Horror", 7.4, null, "https://www.cda.pl/video/sisters/vfilm");

    const dupId = insertMovie(db, {
      title: "Dwie siostry",
      year: 2003,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 10590,
        title: "A Tale of Two Sisters",
        year: 2003,
        genre: "Horror",
        rating: 7.4,
        poster_url: "/sisters.jpg",
        imdb_id: null,
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({ pl_title: null, description: null });

    await GET(getReq(dupId), makeParams(dupId));

    // canonical has no cda_url → recommended_movies must NOT be updated
    const recRow = db
      .prepare("SELECT poster_url FROM recommended_movies WHERE cda_url = ?")
      .get("https://www.cda.pl/video/sisters/vfilm") as { poster_url: string | null };
    expect(recRow.poster_url).toBeNull();

    // Sanity: canonical still exists, dup is gone
    expect(db.prepare("SELECT id FROM movies WHERE id = ?").get(canonicalId)).toBeDefined();
    expect(db.prepare("SELECT id FROM movies WHERE id = ?").get(dupId)).toBeUndefined();
  });

  it("dedup: does not overwrite existing user_rating on canonical with duplicate's value", async () => {
    const canonicalId = insertMovie(db, {
      title: "Oldboy",
      year: 2003,
      genre: "Thriller",
      director: "Park Chan-wook",
      rating: 8.4,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 670,
      type: "movie",
    });
    db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(9, canonicalId);

    const dupId = insertMovie(db, {
      title: "Oldboy PL",
      year: 2003,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "recommendation",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(5, dupId);

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 670,
        title: "Oldboy",
        year: 2003,
        genre: "Thriller",
        rating: 8.4,
        poster_url: null,
        imdb_id: null,
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({ pl_title: null, description: null });

    await GET(getReq(dupId), makeParams(dupId));

    // Canonical's existing user_rating=9 must not be overwritten with duplicate's 5
    const canonRow = db.prepare("SELECT user_rating FROM movies WHERE id = ?").get(canonicalId) as { user_rating: number };
    expect(canonRow.user_rating).toBe(9);
  });
});
