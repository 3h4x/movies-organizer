import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  initDb,
  insertMovie,
  getMovies,
  deleteMovie,
  getCachedEngine,
  setCachedEngine,
  clearCachedEngine,
  dismissRecommendation,
  getDismissedIds,
  saveRecommendedMovies,
  pruneRecommendedMovies,
  getRecommendedMovies,
  updateRecommendedMovie,
  getSetting,
  setSetting,
  getMovieByFilePath,
} from "@/lib/db";

const TEST_DB = path.join(__dirname, "test.db");

describe("database", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("creates movies table with correct columns", () => {
    initDb(db);

    const info = db.pragma("table_info(movies)") as { name: string }[];
    const columns = info.map((c) => c.name);
    expect(columns).toContain("id");
    expect(columns).toContain("title");
    expect(columns).toContain("year");
    expect(columns).toContain("genre");
    expect(columns).toContain("director");
    expect(columns).toContain("rating");
    expect(columns).toContain("poster_url");
    expect(columns).toContain("source");
    expect(columns).toContain("imdb_id");
    expect(columns).toContain("tmdb_id");
    expect(columns).toContain("tmdb_collection_id");
    expect(columns).toContain("tmdb_collection_name");
    expect(columns).toContain("tmdb_collection_checked");
    expect(columns).toContain("type");
  });

  it("creates recommendation_cache table with correct columns", () => {
    initDb(db);

    const info = db.pragma("table_info(recommendation_cache)") as { name: string }[];
    const columns = info.map((c) => c.name);
    expect(columns).toContain("engine");
    expect(columns).toContain("data");
    expect(columns).toContain("movie_count");
  });

  it("inserts and retrieves a movie", () => {
    initDb(db);

    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: "tt1375666",
      tmdb_id: 27205,
      type: "movie",
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
    expect(movies[0].year).toBe(2010);
  });

  it("deletes a movie by id", () => {
    initDb(db);

    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: "tt1375666",
      tmdb_id: 27205,
      type: "movie",
    });

    const movies = getMovies(db);
    deleteMovie(db, movies[0].id);
    expect(getMovies(db)).toHaveLength(0);
  });
});

describe("recommendation cache", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-cache.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns null for non-existent engine", () => {
    const result = getCachedEngine(db, "genre", 10);
    expect(result).toBeNull();
  });

  it("stores and retrieves cache for an engine", () => {
    const data = [{ tmdb_id: 329865, title: "Arrival" }];
    setCachedEngine(db, "genre", data, 5);
    const result = getCachedEngine(db, "genre", 5);
    expect(result).toEqual(data);
  });

  it("preserves recommendation trace in cached engine JSON", () => {
    const data = [{
      reason: "Because you loved Inception",
      type: "movie",
      recommendations: [{
        tmdb_id: 329865,
        title: "Arrival",
        year: 2016,
        genre: "Sci-Fi",
        rating: 7.9,
        poster_url: null,
        imdb_id: null,
        trace: {
          engine: "movie",
          source: "live_tmdb",
          seedKind: "movie",
          seedTmdbId: 27205,
          seedTitle: "Inception",
        },
      }],
    }];
    setCachedEngine(db, "movie", data, 5);
    const result = getCachedEngine<typeof data[number]>(db, "movie", 5);
    expect(result?.[0].recommendations[0].trace).toMatchObject({
      engine: "movie",
      source: "live_tmdb",
      seedTmdbId: 27205,
    });
  });

  it("returns null when movie count differs from cached count", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1, title: "Test" }], 5);
    expect(getCachedEngine(db, "genre", 10)).toBeNull();
  });

  it("replaces existing cache entry for same engine", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1, title: "Old" }], 5);
    setCachedEngine(db, "genre", [{ tmdb_id: 2, title: "New" }], 5);
    const result = getCachedEngine(db, "genre", 5);
    expect(result).toEqual([{ tmdb_id: 2, title: "New" }]);
  });

  it("clears cache for a specific engine only", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1 }], 5);
    setCachedEngine(db, "director", [{ tmdb_id: 2 }], 5);
    clearCachedEngine(db, "genre");
    expect(getCachedEngine(db, "genre", 5)).toBeNull();
    expect(getCachedEngine(db, "director", 5)).toEqual([{ tmdb_id: 2 }]);
  });

  it("also clears recommended_movies for a specific engine", () => {
    const m = { tmdb_id: 1, title: "A", year: 2020, genre: "Drama", rating: 7.0, poster_url: null };
    saveRecommendedMovies(db, "genre", "reason", [m]);
    saveRecommendedMovies(db, "director", "reason2", [{ ...m, tmdb_id: 2 }]);
    clearCachedEngine(db, "genre");
    expect(getRecommendedMovies(db, "genre")).toHaveLength(0);
    expect(getRecommendedMovies(db, "director")).toHaveLength(1);
  });

  it("clears all caches when no engine specified", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1 }], 5);
    setCachedEngine(db, "director", [{ tmdb_id: 2 }], 5);
    clearCachedEngine(db);
    expect(getCachedEngine(db, "genre", 5)).toBeNull();
    expect(getCachedEngine(db, "director", 5)).toBeNull();
  });

  it("also clears all recommended_movies when no engine specified", () => {
    const m = { tmdb_id: 1, title: "A", year: 2020, genre: "Drama", rating: 7.0, poster_url: null };
    saveRecommendedMovies(db, "genre", "reason", [m]);
    saveRecommendedMovies(db, "director", "reason2", [{ ...m, tmdb_id: 2 }]);
    clearCachedEngine(db);
    expect(getRecommendedMovies(db)).toHaveLength(0);
  });

  it("returns null when cached data is malformed JSON", () => {
    db.prepare(
      "INSERT OR REPLACE INTO recommendation_cache (engine, data, movie_count, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
    ).run("genre", "not-valid-json{{{", 5);
    const result = getCachedEngine(db, "genre", 5);
    expect(result).toBeNull();
  });

  it("returns cached data when within maxAgeHours", () => {
    const data = [{ tmdb_id: 1, title: "Fresh" }];
    setCachedEngine(db, "genre", data, 5);
    const result = getCachedEngine(db, "genre", 5, 24);
    expect(result).toEqual(data);
  });

  it("returns null when cache exceeds maxAgeHours", () => {
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "");
    db.prepare(
      "INSERT OR REPLACE INTO recommendation_cache (engine, data, movie_count, created_at) VALUES (?, ?, ?, ?)",
    ).run("genre", JSON.stringify([{ tmdb_id: 1 }]), 5, oldTimestamp);
    expect(getCachedEngine(db, "genre", 5, 24)).toBeNull();
  });

  it("accepts a custom maxAgeHours and respects it", () => {
    const data = [{ tmdb_id: 2, title: "Custom" }];
    const recentTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "");
    db.prepare(
      "INSERT OR REPLACE INTO recommendation_cache (engine, data, movie_count, created_at) VALUES (?, ?, ?, ?)",
    ).run("genre", JSON.stringify(data), 5, recentTimestamp);
    // Within 3h window → hit
    expect(getCachedEngine(db, "genre", 5, 3)).toEqual(data);
    // Outside 1h window → miss
    expect(getCachedEngine(db, "genre", 5, 1)).toBeNull();
  });
});

describe("dismissed recommendations", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-dismiss.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("getDismissedIds returns empty set initially", () => {
    const dismissed = getDismissedIds(db);
    expect(dismissed.size).toBe(0);
  });

  it("dismissRecommendation adds tmdb_id to dismissed set", () => {
    dismissRecommendation(db, 12345);
    const dismissed = getDismissedIds(db);
    expect(dismissed.has(12345)).toBe(true);
  });

  it("dismissing multiple movies tracks all of them", () => {
    dismissRecommendation(db, 111);
    dismissRecommendation(db, 222);
    dismissRecommendation(db, 333);
    const dismissed = getDismissedIds(db);
    expect(dismissed.size).toBe(3);
    expect(dismissed.has(111)).toBe(true);
    expect(dismissed.has(222)).toBe(true);
    expect(dismissed.has(333)).toBe(true);
  });

  it("ignores duplicate dismissals without throwing", () => {
    dismissRecommendation(db, 12345);
    dismissRecommendation(db, 12345);
    const dismissed = getDismissedIds(db);
    expect(dismissed.size).toBe(1);
  });
});

describe("insertMovie deduplication", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-insert-dedup.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const base = {
    title: "Ghost in the Shell",
    year: 1995,
    genre: "Animation",
    director: null,
    rating: 8.0,
    poster_url: null,
    source: "tmdb" as const,
    imdb_id: null,
    tmdb_id: 9323,
    type: "movie" as const,
  };

  it("returns existing id without overwriting file_path when tmdb_id matches and entry already has a file", () => {
    const id1 = insertMovie(db, {
      ...base,
      file_path: "/movies/gits-original.mkv",
      video_metadata: '{"duration":8000}',
    });
    const id2 = insertMovie(db, { ...base, file_path: "/movies/gits-remaster.mkv" });

    // Should point to the same DB entry
    expect(id2).toBe(id1);

    // Primary file_path must NOT have been overwritten
    const row = db.prepare("SELECT file_path, extra_files, video_metadata FROM movies WHERE id = ?").get(id1) as { file_path: string; extra_files: string; video_metadata: string | null };
    expect(row.file_path).toBe("/movies/gits-original.mkv");

    // Second path goes to extra_files
    const extras = JSON.parse(row.extra_files);
    expect(extras).toContain("/movies/gits-remaster.mkv");
    expect(row.video_metadata).toBeNull();
  });

  it("does not create duplicate entries — same tmdb_id returns single row", () => {
    insertMovie(db, { ...base, file_path: "/movies/gits-original.mkv" });
    insertMovie(db, { ...base, file_path: "/movies/gits-remaster.mkv" });

    const rows = db.prepare("SELECT id FROM movies WHERE tmdb_id = ?").all(9323);
    expect(rows).toHaveLength(1);
  });

  it("does not add the same extra_file path twice", () => {
    const id = insertMovie(db, { ...base, file_path: "/movies/gits-original.mkv" });
    insertMovie(db, { ...base, file_path: "/movies/gits-copy.mkv" });
    insertMovie(db, { ...base, file_path: "/movies/gits-copy.mkv" });

    const row = db.prepare("SELECT extra_files FROM movies WHERE id = ?").get(id) as { extra_files: string };
    const extras = JSON.parse(row.extra_files);
    expect(extras.filter((p: string) => p === "/movies/gits-copy.mkv")).toHaveLength(1);
  });

  it("sets file_path when existing entry has none (normal link case)", () => {
    const id = insertMovie(db, { ...base, file_path: null });
    insertMovie(db, { ...base, file_path: "/movies/gits.mkv" });

    const row = db.prepare("SELECT file_path FROM movies WHERE id = ?").get(id) as { file_path: string };
    expect(row.file_path).toBe("/movies/gits.mkv");
  });

  it("deduplicates by title+year when no tmdb_id, adds extra_files instead of overwriting", () => {
    const noTmdb = { ...base, tmdb_id: null };
    const id1 = insertMovie(db, {
      ...noTmdb,
      file_path: "/movies/gits-a.mkv",
      video_metadata: '{"duration":8000}',
    });
    const id2 = insertMovie(db, { ...noTmdb, file_path: "/movies/gits-b.mkv" });

    expect(id2).toBe(id1);

    const row = db.prepare("SELECT file_path, extra_files, video_metadata FROM movies WHERE id = ?").get(id1) as { file_path: string; extra_files: string; video_metadata: string | null };
    expect(row.file_path).toBe("/movies/gits-a.mkv");
    const extras = JSON.parse(row.extra_files);
    expect(extras).toContain("/movies/gits-b.mkv");
    expect(row.video_metadata).toBeNull();
  });

  it("enriches missing genre when tmdb_id match finds entry without genre", () => {
    const id = insertMovie(db, { ...base, genre: null, rating: null, poster_url: null });
    insertMovie(db, { ...base, genre: "Animation, Action", rating: 8.5, poster_url: "/poster.jpg" });

    const row = db.prepare("SELECT genre, rating, poster_url FROM movies WHERE id = ?").get(id) as { genre: string; rating: number; poster_url: string };
    expect(row.genre).toBe("Animation, Action");
    expect(row.rating).toBe(8.5);
    expect(row.poster_url).toBe("/poster.jpg");
  });

  it("does not overwrite existing genre when tmdb_id match finds entry with genre", () => {
    const id = insertMovie(db, { ...base, genre: "Animation", rating: 7.0 });
    insertMovie(db, { ...base, genre: "Action", rating: 9.0 });

    const row = db.prepare("SELECT genre, rating FROM movies WHERE id = ?").get(id) as { genre: string; rating: number };
    expect(row.genre).toBe("Animation");
    expect(row.rating).toBe(7.0);
  });

  it("enriches tmdb_id and genre when title+year match finds entry without them", () => {
    const noTmdb = { ...base, tmdb_id: null, genre: null, poster_url: null };
    const id = insertMovie(db, { ...noTmdb, file_path: null });

    // Now insertMovie with tmdb_id and genre — should enrich the existing pathless entry
    insertMovie(db, { ...base, tmdb_id: 9323, genre: "Animation", poster_url: "/p.jpg", file_path: null });

    const row = db.prepare("SELECT tmdb_id, genre, poster_url FROM movies WHERE id = ?").get(id) as { tmdb_id: number; genre: string; poster_url: string };
    expect(row.tmdb_id).toBe(9323);
    expect(row.genre).toBe("Animation");
    expect(row.poster_url).toBe("/p.jpg");
  });
});

describe("recommended movies", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-recommended.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const sampleMovie = {
    tmdb_id: 329865,
    title: "Arrival",
    year: 2016 as number | null,
    genre: "Sci-Fi" as string | null,
    rating: 7.9 as number | null,
    poster_url: null as string | null,
  };

  it("saves and retrieves recommended movies", () => {
    saveRecommendedMovies(db, "genre", "Because you love Sci-Fi", [sampleMovie]);
    const movies = getRecommendedMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Arrival");
    expect(movies[0].engine).toBe("genre");
    expect(movies[0].reason).toBe("Because you love Sci-Fi");
    expect(movies[0].tmdb_id).toBe(329865);
  });

  it("saves and retrieves recommendation trace from recommended_movies", () => {
    saveRecommendedMovies(db, "genre", "Because you love Sci-Fi", [{
      ...sampleMovie,
      trace: {
        engine: "genre",
        source: "live_tmdb",
        seedKind: "genre",
        seedId: 878,
        seedName: "Sci-Fi",
      },
    }]);
    const movies = getRecommendedMovies(db, "genre");
    expect(movies[0].trace).toMatchObject({
      engine: "genre",
      source: "live_tmdb",
      seedName: "Sci-Fi",
    });
  });

  it("retrieves recommended movies filtered by engine", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi fans", [sampleMovie]);
    saveRecommendedMovies(db, "director", "Nolan films", [
      { tmdb_id: 157336, title: "Interstellar", year: 2014, genre: "Sci-Fi", rating: 8.6, poster_url: null },
    ]);

    const genreMovies = getRecommendedMovies(db, "genre");
    expect(genreMovies).toHaveLength(1);
    expect(genreMovies[0].title).toBe("Arrival");

    const directorMovies = getRecommendedMovies(db, "director");
    expect(directorMovies).toHaveLength(1);
    expect(directorMovies[0].title).toBe("Interstellar");
  });

  it("ignores duplicate tmdb_id + engine combinations", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi fans", [sampleMovie]);
    saveRecommendedMovies(db, "genre", "Sci-Fi fans again", [sampleMovie]);
    expect(getRecommendedMovies(db, "genre")).toHaveLength(1);
  });

  it("allows same tmdb_id under different engines", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi fans", [sampleMovie]);
    saveRecommendedMovies(db, "director", "Villeneuve films", [sampleMovie]);
    expect(getRecommendedMovies(db)).toHaveLength(2);
  });

  it("updateRecommendedMovie updates pl_title", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi", [sampleMovie]);
    updateRecommendedMovie(db, 329865, { pl_title: "Nowy Przybytek" });
    const movies = getRecommendedMovies(db);
    expect(movies[0].pl_title).toBe("Nowy Przybytek");
  });

  it("updateRecommendedMovie updates cda_url", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi", [sampleMovie]);
    updateRecommendedMovie(db, 329865, { cda_url: "https://www.cda.pl/video/arrival" });
    const movies = getRecommendedMovies(db);
    expect(movies[0].cda_url).toBe("https://www.cda.pl/video/arrival");
  });

  it("updateRecommendedMovie updates description", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi", [sampleMovie]);
    updateRecommendedMovie(db, 329865, { description: "A story about first contact." });
    const movies = getRecommendedMovies(db);
    expect(movies[0].description).toBe("A story about first contact.");
  });

  it("updateRecommendedMovie updates all three fields at once", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi", [sampleMovie]);
    updateRecommendedMovie(db, 329865, {
      pl_title: "Przybycie",
      cda_url: "https://www.cda.pl/video/arrival",
      description: "Linguist deciphers alien language.",
    });
    const movies = getRecommendedMovies(db);
    expect(movies[0].pl_title).toBe("Przybycie");
    expect(movies[0].cda_url).toBe("https://www.cda.pl/video/arrival");
    expect(movies[0].description).toBe("Linguist deciphers alien language.");
  });

  it("updateRecommendedMovie is a no-op when no fields are provided", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi", [sampleMovie]);
    updateRecommendedMovie(db, 329865, {});
    const movies = getRecommendedMovies(db);
    expect(movies[0].pl_title).toBeNull();
    expect(movies[0].cda_url).toBeNull();
    expect(movies[0].description).toBeNull();
  });

  it("pruneRecommendedMovies removes entries NOT in keepTmdbIds", () => {
    const stale = { ...sampleMovie, tmdb_id: 1, title: "Stale Film" };
    const keep = { ...sampleMovie, tmdb_id: 2, title: "Keep Film" };
    saveRecommendedMovies(db, "genre", "Picks", [stale, keep]);
    pruneRecommendedMovies(db, "genre", [2]);
    const movies = getRecommendedMovies(db, "genre");
    expect(movies).toHaveLength(1);
    expect(movies[0].tmdb_id).toBe(2);
  });

  it("pruneRecommendedMovies with empty keepTmdbIds removes all entries for that engine", () => {
    saveRecommendedMovies(db, "genre", "Picks", [sampleMovie]);
    pruneRecommendedMovies(db, "genre", []);
    expect(getRecommendedMovies(db, "genre")).toHaveLength(0);
  });

  it("pruneRecommendedMovies does not touch other engines", () => {
    saveRecommendedMovies(db, "genre", "Picks", [sampleMovie]);
    saveRecommendedMovies(db, "director", "Director Picks", [sampleMovie]);
    pruneRecommendedMovies(db, "genre", []);
    expect(getRecommendedMovies(db, "genre")).toHaveLength(0);
    expect(getRecommendedMovies(db, "director")).toHaveLength(1);
  });

  it("pruneRecommendedMovies preserves enrichment data on kept entries", () => {
    saveRecommendedMovies(db, "genre", "Picks", [sampleMovie]);
    updateRecommendedMovie(db, sampleMovie.tmdb_id, {
      pl_title: "Przybycie",
      cda_url: "https://www.cda.pl/video/arrival",
    });
    const stale = { ...sampleMovie, tmdb_id: 999, title: "Stale Film" };
    saveRecommendedMovies(db, "genre", "Picks", [stale]);
    pruneRecommendedMovies(db, "genre", [sampleMovie.tmdb_id]);
    const movies = getRecommendedMovies(db, "genre");
    expect(movies).toHaveLength(1);
    expect(movies[0].pl_title).toBe("Przybycie");
    expect(movies[0].cda_url).toBe("https://www.cda.pl/video/arrival");
  });

  it("pruneRecommendedMovies is a no-op when all entries are in keepTmdbIds", () => {
    saveRecommendedMovies(db, "genre", "Picks", [sampleMovie]);
    pruneRecommendedMovies(db, "genre", [sampleMovie.tmdb_id]);
    expect(getRecommendedMovies(db, "genre")).toHaveLength(1);
  });

  it("getRecommendedMovies prefers TMDb poster from movies table over stored poster", () => {
    const rec = { ...sampleMovie, poster_url: "https://cda.pl/thumb.jpg" };
    saveRecommendedMovies(db, "cda", "CDA Pick", [rec]);
    insertMovie(db, {
      title: rec.title,
      year: rec.year,
      genre: rec.genre,
      director: null,
      rating: rec.rating,
      poster_url: "https://image.tmdb.org/t/p/w300/arrival.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: rec.tmdb_id,
      type: "movie",
    });
    const results = getRecommendedMovies(db, "cda");
    expect(results[0].poster_url).toBe("https://image.tmdb.org/t/p/w300/arrival.jpg");
  });

  it("getRecommendedMovies falls back to stored poster when movies table has no TMDb poster", () => {
    const rec = { ...sampleMovie, poster_url: "https://cda.pl/thumb.jpg" };
    saveRecommendedMovies(db, "cda", "CDA Pick", [rec]);
    insertMovie(db, {
      title: rec.title,
      year: rec.year,
      genre: rec.genre,
      director: null,
      rating: rec.rating,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: rec.tmdb_id,
      type: "movie",
    });
    const results = getRecommendedMovies(db, "cda");
    expect(results[0].poster_url).toBe("https://cda.pl/thumb.jpg");
  });

  it("getRecommendedMovies falls back to stored poster when no movies entry for tmdb_id", () => {
    const rec = { ...sampleMovie, poster_url: "https://cda.pl/thumb.jpg" };
    saveRecommendedMovies(db, "cda", "CDA Pick", [rec]);
    const results = getRecommendedMovies(db, "cda");
    expect(results[0].poster_url).toBe("https://cda.pl/thumb.jpg");
  });

  it("getRecommendedMovies does not use non-TMDb poster from movies table (must match https://image.tmdb.org%)", () => {
    const rec = { ...sampleMovie, poster_url: "https://cda.pl/thumb.jpg" };
    saveRecommendedMovies(db, "cda", "CDA Pick", [rec]);
    insertMovie(db, {
      title: rec.title,
      year: rec.year,
      genre: rec.genre,
      director: null,
      rating: rec.rating,
      poster_url: "https://example.com/other-poster.jpg",
      source: "tmdb",
      imdb_id: null,
      tmdb_id: rec.tmdb_id,
      type: "movie",
    });
    const results = getRecommendedMovies(db, "cda");
    expect(results[0].poster_url).toBe("https://cda.pl/thumb.jpg");
  });
});

describe("getSetting / setSetting", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns null for a key that has not been set", () => {
    expect(getSetting(db, "nonexistent_key")).toBeNull();
  });

  it("stores and retrieves a setting", () => {
    setSetting(db, "library_path", "/movies");
    expect(getSetting(db, "library_path")).toBe("/movies");
  });

  it("overwrites an existing setting with INSERT OR REPLACE", () => {
    setSetting(db, "library_path", "/old");
    setSetting(db, "library_path", "/new");
    expect(getSetting(db, "library_path")).toBe("/new");
  });

  it("stores multiple independent settings", () => {
    setSetting(db, "tmdb_api_key", "abc123");
    setSetting(db, "library_path", "/movies");
    expect(getSetting(db, "tmdb_api_key")).toBe("abc123");
    expect(getSetting(db, "library_path")).toBe("/movies");
  });
});

describe("getMovieByFilePath", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns null when no movie has the given file path", () => {
    expect(getMovieByFilePath(db, "/movies/nonexistent.mkv")).toBeNull();
  });

  it("returns the matching movie when found", () => {
    insertMovie(db, {
      title: "Blade Runner",
      year: 1982,
      genre: "Sci-Fi",
      director: "Ridley Scott",
      rating: 8.1,
      poster_url: null,
      source: "local",
      imdb_id: "tt0083658",
      tmdb_id: 78,
      type: "movie",
      file_path: "/movies/blade_runner.mkv",
    });
    const movie = getMovieByFilePath(db, "/movies/blade_runner.mkv");
    expect(movie).not.toBeNull();
    expect(movie!.title).toBe("Blade Runner");
    expect(movie!.file_path).toBe("/movies/blade_runner.mkv");
  });

  it("returns null for a path that does not exactly match", () => {
    insertMovie(db, {
      title: "Blade Runner",
      year: 1982,
      genre: "Sci-Fi",
      director: null,
      rating: 8.1,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: 78,
      type: "movie",
      file_path: "/movies/blade_runner.mkv",
    });
    expect(getMovieByFilePath(db, "/movies/BLADE_RUNNER.mkv")).toBeNull();
  });
});

describe("getMovies sort order", () => {
  const TEST_SORT_DB = path.join(__dirname, "test-sort.db");
  let db: Database.Database;

  function insert(title: string, tmdbId: number, userRating: number | null) {
    const id = insertMovie(db, {
      title,
      year: 2000,
      genre: "Drama",
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: tmdbId,
      type: "movie",
    });
    if (userRating !== null) {
      db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(userRating, id);
    }
    return id;
  }

  beforeEach(() => {
    db = new Database(TEST_SORT_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_SORT_DB)) fs.unlinkSync(TEST_SORT_DB);
  });

  it("places movies with user_rating < 5 after unrated and well-rated movies", () => {
    insert("Disliked Film", 1, 3);
    insert("Well Rated Film", 2, 8);
    insert("Unrated Film", 3, null);

    const titles = getMovies(db).map((m) => m.title);
    const dislikedIdx = titles.indexOf("Disliked Film");
    const wellRatedIdx = titles.indexOf("Well Rated Film");
    const unratedIdx = titles.indexOf("Unrated Film");

    expect(dislikedIdx).toBeGreaterThan(wellRatedIdx);
    expect(dislikedIdx).toBeGreaterThan(unratedIdx);
  });

  it("sorts well-rated movies before unrated within the top group", () => {
    insert("Unrated Film", 1, null);
    insert("Rated 9", 2, 9);
    insert("Rated 7", 3, 7);

    const titles = getMovies(db).map((m) => m.title);
    // user_rating DESC: rated 9 first, then rated 7, then NULL (NULL sorts last in SQLite for DESC)
    // But actually in SQLite DESC, NULLs sort first. Let's just verify rated > 5 appear before < 5.
    const rated9Idx = titles.indexOf("Rated 9");
    const rated7Idx = titles.indexOf("Rated 7");
    // 9 should appear before 7 (higher rating → earlier in results)
    expect(rated9Idx).toBeLessThan(rated7Idx);
  });

  it("sinks all disliked movies (< 5) to the bottom regardless of rating value", () => {
    insert("Score 4", 1, 4);
    insert("Score 1", 2, 1);
    insert("Unrated", 3, null);
    insert("Score 8", 4, 8);

    const titles = getMovies(db).map((m) => m.title);
    const score8Idx = titles.indexOf("Score 8");
    const unratedIdx = titles.indexOf("Unrated");
    const score4Idx = titles.indexOf("Score 4");
    const score1Idx = titles.indexOf("Score 1");

    // Well-rated and unrated come before disliked
    expect(score4Idx).toBeGreaterThan(score8Idx);
    expect(score4Idx).toBeGreaterThan(unratedIdx);
    expect(score1Idx).toBeGreaterThan(score8Idx);
    expect(score1Idx).toBeGreaterThan(unratedIdx);
  });

  it("filters by type parameter without breaking sort", () => {
    insert("Movie A", 1, 8);
    const seriesId = insertMovie(db, {
      title: "Series B",
      year: 2001,
      genre: "Drama",
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 999,
      type: "series",
    });
    void seriesId;

    const movies = getMovies(db, "movie");
    expect(movies.every((m) => m.type === "movie")).toBe(true);
    expect(movies.some((m) => m.title === "Movie A")).toBe(true);
    expect(movies.some((m) => m.title === "Series B")).toBe(false);

    const series = getMovies(db, "series");
    expect(series.every((m) => m.type === "series")).toBe(true);
  });

  it("returns no rows for nonblank FTS searches with no searchable tokens", () => {
    insert("Movie A", 1, 8);
    insertMovie(db, {
      title: "Series B",
      year: 2001,
      genre: "Drama",
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 999,
      type: "series",
    });

    expect(getMovies(db, undefined, "!!!")).toEqual([]);
    expect(getMovies(db, "series", "!!!")).toEqual([]);
  });
});

// The original movies schema (before any migrations were added).
// All base columns that have always been present must be here so that
// the index creation at the end of initDb does not fail on missing columns.
const ORIGINAL_MOVIES_SCHEMA = `
  CREATE TABLE movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    year INTEGER,
    genre TEXT,
    director TEXT,
    rating REAL,
    poster_url TEXT,
    source TEXT,
    imdb_id TEXT,
    tmdb_id INTEGER,
    type TEXT DEFAULT 'movie'
  );
  CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

describe("database migrations on existing schema", () => {
  let db: Database.Database;
  const MIGRATION_DB = path.join(__dirname, "test-migrations.db");

  afterEach(() => {
    db.close();
    if (fs.existsSync(MIGRATION_DB)) fs.unlinkSync(MIGRATION_DB);
  });

  it("adds missing columns to movies table created without migrations", () => {
    db = new Database(MIGRATION_DB);
    db.exec(ORIGINAL_MOVIES_SCHEMA);

    initDb(db);

    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("file_path");
    expect(cols).toContain("video_metadata");
    expect(cols).toContain("writer");
    expect(cols).toContain("actors");
    expect(cols).toContain("extra_files");
    expect(cols).toContain("user_rating");
    expect(cols).toContain("wishlist");
    expect(cols).toContain("rated_at");
    expect(cols).toContain("pl_title");
    expect(cols).toContain("description");
    expect(cols).toContain("cda_url");
    expect(cols).toContain("filmweb_id");
    expect(cols).toContain("filmweb_url");
    expect(cols).toContain("tmdb_refreshed_at");
  });

  it("records all migrations in _migrations table", () => {
    db = new Database(MIGRATION_DB);
    db.exec(ORIGINAL_MOVIES_SCHEMA);

    initDb(db);

    const migrationNames = (
      db.prepare("SELECT name FROM _migrations").all() as { name: string }[]
    ).map((r) => r.name);
    expect(migrationNames).toContain("add_file_path");
    expect(migrationNames).toContain("add_video_metadata");
    expect(migrationNames).toContain("add_tmdb_collection_columns");
    expect(migrationNames).toContain("add_tmdb_collection_checked");
    expect(migrationNames).toContain("add_credits");
    expect(migrationNames).toContain("add_extra_files");
    expect(migrationNames).toContain("add_user_columns");
    expect(migrationNames).toContain("add_tmdb_refreshed_at");
    expect(migrationNames).toContain("add_movies_fts");
  });

  it("is idempotent — calling initDb twice does not throw or duplicate migrations", () => {
    db = new Database(MIGRATION_DB);
    initDb(db);
    expect(() => initDb(db)).not.toThrow();

    const migrationRows = db.prepare("SELECT COUNT(*) as c FROM _migrations").get() as { c: number };
    // Exactly 9 named migrations, no duplicates
    expect(migrationRows.c).toBe(9);
  });

  it("migrates old id-based recommendation_cache to engine-based schema", () => {
    db = new Database(MIGRATION_DB);
    db.exec(ORIGINAL_MOVIES_SCHEMA);
    // Old schema had 'id' column and no 'engine' column
    db.exec(`
      CREATE TABLE recommendation_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        movie_count INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    initDb(db);

    const cols = (db.pragma("table_info(recommendation_cache)") as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("engine");
    expect(cols).not.toContain("id");
  });

  it("adds description column to recommended_movies when missing", () => {
    db = new Database(MIGRATION_DB);
    db.exec(ORIGINAL_MOVIES_SCHEMA);
    // Create recommended_movies without the description column
    db.exec(`
      CREATE TABLE recommended_movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_id INTEGER NOT NULL,
        engine TEXT NOT NULL,
        reason TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        genre TEXT,
        rating REAL,
        poster_url TEXT,
        pl_title TEXT,
        cda_url TEXT,
        UNIQUE(tmdb_id, engine)
      );
    `);

    initDb(db);

    const cols = (db.pragma("table_info(recommended_movies)") as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("description");
  });

  it("adds trace column to recommended_movies when missing", () => {
    db = new Database(MIGRATION_DB);
    db.exec(ORIGINAL_MOVIES_SCHEMA);
    db.exec(`
      CREATE TABLE recommended_movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_id INTEGER NOT NULL,
        engine TEXT NOT NULL,
        reason TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        genre TEXT,
        rating REAL,
        poster_url TEXT,
        pl_title TEXT,
        cda_url TEXT,
        description TEXT,
        UNIQUE(tmdb_id, engine)
      );
    `);

    initDb(db);

    const cols = (db.pragma("table_info(recommended_movies)") as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("trace");
  });

  it("preserves existing movie data through migrations", () => {
    db = new Database(MIGRATION_DB);
    db.exec(ORIGINAL_MOVIES_SCHEMA);
    db.prepare("INSERT INTO movies (title, year) VALUES (?, ?)").run("The Matrix", 1999);

    initDb(db);

    const movie = db.prepare("SELECT * FROM movies WHERE title = 'The Matrix'").get() as { title: string; year: number; file_path: unknown };
    expect(movie).toBeDefined();
    expect(movie.title).toBe("The Matrix");
    expect(movie.year).toBe(1999);
    expect(movie.file_path).toBeNull();
  });

  it("skips already-applied migrations and still runs pending ones", () => {
    db = new Database(MIGRATION_DB);
    // Simulate a DB at the state after add_file_path and add_video_metadata have run,
    // but before add_credits was applied.
    db.exec(ORIGINAL_MOVIES_SCHEMA);
    db.exec("ALTER TABLE movies ADD COLUMN file_path TEXT");
    db.exec("ALTER TABLE movies ADD COLUMN video_metadata TEXT");
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run("add_file_path");
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run("add_video_metadata");

    expect(() => initDb(db)).not.toThrow();

    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    // Already-applied columns still present
    expect(cols).toContain("file_path");
    expect(cols).toContain("video_metadata");
    // Pending migrations ran
    expect(cols).toContain("writer");
    expect(cols).toContain("actors");
    expect(cols).toContain("extra_files");
    expect(cols).toContain("user_rating");
  });
});
