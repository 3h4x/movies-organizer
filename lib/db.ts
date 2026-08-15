import Database from "better-sqlite3";
import path from "path";
import type { RecommendationTrace } from "@/lib/recommendation-trace";

export interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  type: string;
  file_path: string | null;
  extra_files: string | null; // JSON array of additional file paths
  created_at: string;
  // Columns added by filmweb import and other optional migrations
  user_rating?: number | null;
  pl_title?: string | null;
  filmweb_id?: number | null;
  filmweb_url?: string | null;
  rated_at?: string | null;
  wishlist?: number | null;
  description?: string | null;
  cda_url?: string | null;
  video_metadata?: string | null;
  tmdb_collection_id?: number | null;
  tmdb_collection_name?: string | null;
  tmdb_collection_checked?: number | null;
  tmdb_refreshed_at?: number | null;
}

export interface TvEpisodeProgress {
  id: number;
  movie_id: number;
  season_number: number;
  episode_number: number;
  watched_at: string;
  created_at: string;
  updated_at: string;
}

export interface MovieInput {
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer?: string | null;
  actors?: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  type: string;
  file_path?: string | null;
  extra_files?: string | null;
  user_rating?: number | null;
  pl_title?: string | null;
  filmweb_id?: number | null;
  filmweb_url?: string | null;
  rated_at?: string | null;
  wishlist?: number | null;
  description?: string | null;
  cda_url?: string | null;
  video_metadata?: string | null;
  tmdb_collection_id?: number | null;
  tmdb_collection_name?: string | null;
  tmdb_collection_checked?: number | null;
  tmdb_refreshed_at?: number | null;
}

const DB_PATH = path.join(process.cwd(), "data", "movies.db");

export function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS movies (
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
      type TEXT DEFAULT 'movie',
      file_path TEXT,
      extra_files TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      video_metadata TEXT,
      tmdb_collection_id INTEGER,
      tmdb_collection_name TEXT,
      tmdb_collection_checked INTEGER DEFAULT 0,
      tmdb_refreshed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Add file_path column if missing (migration)
    CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
  `);

  const hasMigration = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_file_path'")
    .get();
  if (!hasMigration) {
    try {
      db.exec("ALTER TABLE movies ADD COLUMN file_path TEXT");
    } catch {
      // Column already exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_file_path')",
    ).run();
  }

  const hasVideoMetadata = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_video_metadata'")
    .get();
  if (!hasVideoMetadata) {
    try {
      db.exec("ALTER TABLE movies ADD COLUMN video_metadata TEXT");
    } catch {
      // Column already exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_video_metadata')",
    ).run();
  }

  const hasCollectionColumns = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_tmdb_collection_columns'")
    .get();
  if (!hasCollectionColumns) {
    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    if (!cols.includes("tmdb_collection_id")) {
      db.exec("ALTER TABLE movies ADD COLUMN tmdb_collection_id INTEGER");
    }
    if (!cols.includes("tmdb_collection_name")) {
      db.exec("ALTER TABLE movies ADD COLUMN tmdb_collection_name TEXT");
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_tmdb_collection_columns')",
    ).run();
  }

  const hasCollectionChecked = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_tmdb_collection_checked'")
    .get();
  if (!hasCollectionChecked) {
    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    if (!cols.includes("tmdb_collection_checked")) {
      db.exec("ALTER TABLE movies ADD COLUMN tmdb_collection_checked INTEGER DEFAULT 0");
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_tmdb_collection_checked')",
    ).run();
  }

  const hasTmdbRefreshedAt = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_tmdb_refreshed_at'")
    .get();
  if (!hasTmdbRefreshedAt) {
    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    if (!cols.includes("tmdb_refreshed_at")) {
      db.exec("ALTER TABLE movies ADD COLUMN tmdb_refreshed_at INTEGER");
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_tmdb_refreshed_at')",
    ).run();
  }

  const hasCredits = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_credits'")
    .get();
  if (!hasCredits) {
    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    if (!cols.includes("writer")) {
      db.exec("ALTER TABLE movies ADD COLUMN writer TEXT");
    }
    if (!cols.includes("actors")) {
      db.exec("ALTER TABLE movies ADD COLUMN actors TEXT");
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_credits')",
    ).run();
  }

  const hasExtraFiles = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_extra_files'")
    .get();
  if (!hasExtraFiles) {
    try {
      db.exec("ALTER TABLE movies ADD COLUMN extra_files TEXT");
    } catch {
      // Column already exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_extra_files')",
    ).run();
  }

  const hasUserColumns = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_user_columns'")
    .get();
  if (!hasUserColumns) {
    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    const toAdd: [string, string][] = [
      ["user_rating", "REAL"],
      ["wishlist", "INTEGER DEFAULT 0"],
      ["rated_at", "TEXT"],
      ["pl_title", "TEXT"],
      ["description", "TEXT"],
      ["cda_url", "TEXT"],
      ["filmweb_id", "INTEGER"],
      ["filmweb_url", "TEXT"],
    ];
    for (const [col, type] of toAdd) {
      if (!cols.includes(col)) {
        try {
          db.exec(`ALTER TABLE movies ADD COLUMN ${col} ${type}`);
        } catch {
          // Column already exists
        }
      }
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_user_columns')",
    ).run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS dismissed_recommendations (
      tmdb_id INTEGER PRIMARY KEY,
      dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommendation_cache (
      engine TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      movie_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommended_movies (
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
      trace TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tmdb_id, engine)
    );
  `);

  // Migration: add description column to recommended_movies if missing
  const recMovieCols = (
    db.pragma("table_info(recommended_movies)") as { name: string }[]
  ).map((c) => c.name);
  if (!recMovieCols.includes("description")) {
    db.exec("ALTER TABLE recommended_movies ADD COLUMN description TEXT");
  }
  if (!recMovieCols.includes("trace")) {
    db.exec("ALTER TABLE recommended_movies ADD COLUMN trace TEXT");
  }
  // CDA link health: when each cda_url was last probed and the HTTP status it
  // returned, so dead links (404/410) can be detected and excluded over time.
  if (!recMovieCols.includes("cda_last_checked_at")) {
    db.exec("ALTER TABLE recommended_movies ADD COLUMN cda_last_checked_at TEXT");
  }
  if (!recMovieCols.includes("cda_last_status")) {
    db.exec("ALTER TABLE recommended_movies ADD COLUMN cda_last_status INTEGER");
  }

  // Migration: old recommendation_cache had 'id' column, new one has 'engine'
  const cacheInfo = db.pragma("table_info(recommendation_cache)") as {
    name: string;
  }[];
  if (
    cacheInfo.some((c) => c.name === "id") &&
    !cacheInfo.some((c) => c.name === "engine")
  ) {
    db.exec("DROP TABLE recommendation_cache");
    db.exec(`CREATE TABLE recommendation_cache (
      engine TEXT PRIMARY KEY, data TEXT NOT NULL, movie_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // Migration: recommendation_events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS recommendation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER NOT NULL,
      engine TEXT NOT NULL DEFAULT '',
      event TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rec_events_tmdb_engine ON recommendation_events (tmdb_id, engine, created_at);
  `);

  // Migration: recommendation_impressions table (rotates the top of each row over time)
  db.exec(`
    CREATE TABLE IF NOT EXISTS recommendation_impressions (
      tmdb_id INTEGER NOT NULL,
      engine TEXT NOT NULL,
      shown_count INTEGER NOT NULL DEFAULT 1,
      last_shown_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (tmdb_id, engine)
    );
    CREATE INDEX IF NOT EXISTS idx_rec_impressions_engine ON recommendation_impressions (engine, last_shown_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tv_episode_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(movie_id, season_number, episode_number),
      FOREIGN KEY(movie_id) REFERENCES movies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tv_episode_progress_movie
      ON tv_episode_progress (movie_id, season_number, episode_number);
  `);

  const hasMoviesFts = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_movies_fts'")
    .get();
  if (!hasMoviesFts) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS movies_fts USING fts5(
        title,
        pl_title,
        director,
        writer,
        actors,
        content='movies',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS movies_fts_ai AFTER INSERT ON movies BEGIN
        INSERT INTO movies_fts(rowid, title, pl_title, director, writer, actors)
        VALUES (new.id, new.title, new.pl_title, new.director, new.writer, new.actors);
      END;

      CREATE TRIGGER IF NOT EXISTS movies_fts_ad AFTER DELETE ON movies BEGIN
        INSERT INTO movies_fts(movies_fts, rowid, title, pl_title, director, writer, actors)
        VALUES ('delete', old.id, old.title, old.pl_title, old.director, old.writer, old.actors);
      END;

      CREATE TRIGGER IF NOT EXISTS movies_fts_au AFTER UPDATE ON movies BEGIN
        INSERT INTO movies_fts(movies_fts, rowid, title, pl_title, director, writer, actors)
        VALUES ('delete', old.id, old.title, old.pl_title, old.director, old.writer, old.actors);
        INSERT INTO movies_fts(rowid, title, pl_title, director, writer, actors)
        VALUES (new.id, new.title, new.pl_title, new.director, new.writer, new.actors);
      END;

      INSERT INTO movies_fts(movies_fts) VALUES ('rebuild');
    `);
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_movies_fts')",
    ).run();
  }

  // Indexes for common query patterns (idempotent — IF NOT EXISTS)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies (tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_movies_tmdb_refreshed_at ON movies (tmdb_refreshed_at);
    CREATE INDEX IF NOT EXISTS idx_movies_tmdb_collection_id ON movies (tmdb_collection_id);
    CREATE INDEX IF NOT EXISTS idx_movies_file_path ON movies (file_path);
    CREATE INDEX IF NOT EXISTS idx_movies_user_rating ON movies (user_rating);
    CREATE INDEX IF NOT EXISTS idx_movies_title_year ON movies (title, year);
    CREATE INDEX IF NOT EXISTS idx_movies_type ON movies (type);
    CREATE INDEX IF NOT EXISTS idx_movies_source ON movies (source);
    CREATE INDEX IF NOT EXISTS idx_recommended_movies_tmdb_id ON recommended_movies (tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_recommended_movies_cda_checked ON recommended_movies (engine, cda_last_checked_at);
  `);
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initDb(_db);
  }
  return _db;
}

// Fills in null/empty metadata fields on an existing row from an incoming MovieInput.
// Only overwrites fields that are currently null or empty — never replaces user data.
function enrichMissingMetadata(
  db: Database.Database,
  id: number,
  existing: {
    year?: number | null;
    genre: string | null;
    rating: number | null;
    poster_url: string | null;
    imdb_id: string | null;
    tmdb_id?: number | null;
    user_rating?: number | null;
    pl_title?: string | null;
    filmweb_id?: number | null;
    filmweb_url?: string | null;
    rated_at?: string | null;
    wishlist?: number | null;
    description?: string | null;
    cda_url?: string | null;
    video_metadata?: string | null;
    tmdb_collection_id?: number | null;
    tmdb_collection_name?: string | null;
    tmdb_collection_checked?: number | null;
  },
  incoming: MovieInput,
): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if ("year" in existing && existing.year == null && incoming.year != null) { sets.push("year = ?"); values.push(incoming.year); }
  if (!existing.genre && incoming.genre) { sets.push("genre = ?"); values.push(incoming.genre); }
  if (!existing.rating && incoming.rating) { sets.push("rating = ?"); values.push(incoming.rating); }
  if (!existing.poster_url && incoming.poster_url) { sets.push("poster_url = ?"); values.push(incoming.poster_url); }
  if (!existing.imdb_id && incoming.imdb_id) { sets.push("imdb_id = ?"); values.push(incoming.imdb_id); }
  if ("tmdb_id" in existing && !existing.tmdb_id && incoming.tmdb_id) { sets.push("tmdb_id = ?"); values.push(incoming.tmdb_id); }
  if ("user_rating" in existing && existing.user_rating == null && incoming.user_rating != null) { sets.push("user_rating = ?"); values.push(incoming.user_rating); }
  if ("pl_title" in existing && !existing.pl_title && incoming.pl_title) { sets.push("pl_title = ?"); values.push(incoming.pl_title); }
  if ("filmweb_id" in existing && existing.filmweb_id == null && incoming.filmweb_id != null) { sets.push("filmweb_id = ?"); values.push(incoming.filmweb_id); }
  if ("filmweb_url" in existing && !existing.filmweb_url && incoming.filmweb_url) { sets.push("filmweb_url = ?"); values.push(incoming.filmweb_url); }
  if ("rated_at" in existing && !existing.rated_at && incoming.rated_at) { sets.push("rated_at = ?"); values.push(incoming.rated_at); }
  if ("description" in existing && !existing.description && incoming.description) { sets.push("description = ?"); values.push(incoming.description); }
  if ("cda_url" in existing && !existing.cda_url && incoming.cda_url) { sets.push("cda_url = ?"); values.push(incoming.cda_url); }
  if ("video_metadata" in existing && !existing.video_metadata && incoming.video_metadata) { sets.push("video_metadata = ?"); values.push(incoming.video_metadata); }
  if ("tmdb_collection_id" in existing && !existing.tmdb_collection_id && incoming.tmdb_collection_id) { sets.push("tmdb_collection_id = ?"); values.push(incoming.tmdb_collection_id); }
  if ("tmdb_collection_name" in existing && !existing.tmdb_collection_name && incoming.tmdb_collection_name) { sets.push("tmdb_collection_name = ?"); values.push(incoming.tmdb_collection_name); }
  if ("tmdb_collection_checked" in existing && (existing.tmdb_collection_checked == null || existing.tmdb_collection_checked === 0) && incoming.tmdb_collection_checked === 1) { sets.push("tmdb_collection_checked = ?"); values.push(incoming.tmdb_collection_checked); }
  if ("wishlist" in existing && (existing.wishlist == null || existing.wishlist === 0) && incoming.wishlist === 1) { sets.push("wishlist = ?"); values.push(incoming.wishlist); }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function enrichMovieMetadata(
  db: Database.Database,
  id: number,
  incoming: MovieInput,
): void {
  const existing = db
    .prepare(
      "SELECT year, genre, rating, poster_url, imdb_id, tmdb_id, user_rating, pl_title, filmweb_id, filmweb_url, rated_at, wishlist, description, cda_url, video_metadata FROM movies WHERE id = ?",
    )
    .get(id) as
    | {
        year: number | null;
        genre: string | null;
        rating: number | null;
        poster_url: string | null;
        imdb_id: string | null;
        tmdb_id: number | null;
        user_rating: number | null;
        pl_title: string | null;
        filmweb_id: number | null;
        filmweb_url: string | null;
        rated_at: string | null;
        wishlist: number | null;
        description: string | null;
        cda_url: string | null;
        video_metadata: string | null;
      }
    | undefined;
  if (!existing) return;
  enrichMissingMetadata(db, id, existing, incoming);
}

export function movieNeedsTmdbEnrichment(
  db: Database.Database,
  id: number,
): boolean {
  const existing = db
    .prepare(
      "SELECT year, genre, rating, poster_url, imdb_id, tmdb_id FROM movies WHERE id = ?",
    )
    .get(id) as
    | {
        year: number | null;
        genre: string | null;
        rating: number | null;
        poster_url: string | null;
        imdb_id: string | null;
        tmdb_id: number | null;
      }
    | undefined;
  if (!existing) return false;
  // Deliberately NOT checking imdb_id: TMDb's search endpoint never returns it
  // (mapResult in lib/tmdb.ts hardcodes null), so requiring it here would mean
  // the row can never be considered enriched and every import/sync would query
  // TMDb for it again forever.
  return (
    existing.year == null ||
    existing.genre == null ||
    existing.rating == null ||
    existing.poster_url == null ||
    existing.tmdb_id == null
  );
}

export function getExistingMovieInsertTargetId(
  db: Database.Database,
  movie: MovieInput,
): number | null {
  if (movie.file_path) {
    const byFilePath = db
      .prepare("SELECT id FROM movies WHERE file_path = ?")
      .get(movie.file_path) as { id: number } | undefined;
    if (byFilePath) return byFilePath.id;
  }

  if (movie.tmdb_id) {
    const byTmdbId = db
      .prepare("SELECT id FROM movies WHERE tmdb_id = ?")
      .get(movie.tmdb_id) as { id: number } | undefined;
    if (byTmdbId) return byTmdbId.id;
  }

  if (movie.title) {
    const byTitleYear = db
      .prepare("SELECT id FROM movies WHERE LOWER(title) = LOWER(?) AND year IS ?")
      .get(movie.title, movie.year ?? null) as { id: number } | undefined;
    if (byTitleYear) return byTitleYear.id;
  }

  return null;
}

export function insertMovie(db: Database.Database, movie: MovieInput): number {
  if (movie.file_path) {
    const existing = db
      .prepare("SELECT id FROM movies WHERE file_path = ?")
      .get(movie.file_path) as { id: number } | undefined;
    if (existing) return existing.id;
  }

  // If a movie with the same tmdb_id already exists, link the file to it
  if (movie.tmdb_id) {
    const byTmdbId = db
      .prepare("SELECT id, year, file_path, extra_files, genre, rating, poster_url, imdb_id, user_rating, pl_title, filmweb_id, filmweb_url, rated_at, wishlist, description, cda_url, video_metadata, tmdb_collection_id, tmdb_collection_name, tmdb_collection_checked FROM movies WHERE tmdb_id = ?")
      .get(movie.tmdb_id) as { id: number; year: number | null; file_path: string | null; extra_files: string | null; genre: string | null; rating: number | null; poster_url: string | null; imdb_id: string | null; user_rating: number | null; pl_title: string | null; filmweb_id: number | null; filmweb_url: string | null; rated_at: string | null; wishlist: number | null; description: string | null; cda_url: string | null; video_metadata: string | null; tmdb_collection_id: number | null; tmdb_collection_name: string | null; tmdb_collection_checked: number | null } | undefined;
    if (byTmdbId) {
      if (movie.file_path) {
        if (!byTmdbId.file_path) {
          // No primary file yet — set it and bump created_at so it sorts to top of "Date Added"
          db.prepare("UPDATE movies SET file_path = ?, video_metadata = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?").run(movie.file_path, byTmdbId.id);
        } else if (byTmdbId.file_path !== movie.file_path) {
          // Already has a different primary file — add to extra_files to avoid overwrite loop
          const extras: string[] = byTmdbId.extra_files ? JSON.parse(byTmdbId.extra_files) : [];
          if (!extras.includes(movie.file_path)) {
            extras.push(movie.file_path);
            db.prepare("UPDATE movies SET extra_files = ?, video_metadata = NULL WHERE id = ?").run(JSON.stringify(extras), byTmdbId.id);
          }
        }
      }
      // Fill in missing metadata from the incoming record (e.g. recommendation enriching a scanned entry)
      enrichMissingMetadata(db, byTmdbId.id, byTmdbId, movie);
      return byTmdbId.id;
    }
  }

  // If a movie with the same title+year already exists, return existing id
  // and update file_path if the new entry has one
  if (movie.title) {
    const byTitleYear = db
      .prepare(
        "SELECT id, year, file_path, extra_files, genre, rating, poster_url, imdb_id, tmdb_id, user_rating, pl_title, filmweb_id, filmweb_url, rated_at, wishlist, description, cda_url, video_metadata, tmdb_collection_id, tmdb_collection_name, tmdb_collection_checked FROM movies WHERE LOWER(title) = LOWER(?) AND year IS ?",
      )
      .get(movie.title, movie.year ?? null) as { id: number; year: number | null; file_path: string | null; extra_files: string | null; genre: string | null; rating: number | null; poster_url: string | null; imdb_id: string | null; tmdb_id: number | null; user_rating: number | null; pl_title: string | null; filmweb_id: number | null; filmweb_url: string | null; rated_at: string | null; wishlist: number | null; description: string | null; cda_url: string | null; video_metadata: string | null; tmdb_collection_id: number | null; tmdb_collection_name: string | null; tmdb_collection_checked: number | null } | undefined;
    if (byTitleYear) {
      if (movie.file_path) {
        if (!byTitleYear.file_path) {
          db.prepare("UPDATE movies SET file_path = ?, video_metadata = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?").run(movie.file_path, byTitleYear.id);
        } else if (byTitleYear.file_path !== movie.file_path) {
          const extras: string[] = byTitleYear.extra_files ? JSON.parse(byTitleYear.extra_files) : [];
          if (!extras.includes(movie.file_path)) {
            extras.push(movie.file_path);
            db.prepare("UPDATE movies SET extra_files = ?, video_metadata = NULL WHERE id = ?").run(JSON.stringify(extras), byTitleYear.id);
          }
        }
      }
      // Fill in missing metadata (e.g. tmdb_id, genre, rating) from the incoming record
      enrichMissingMetadata(db, byTitleYear.id, byTitleYear, movie);
      return byTitleYear.id;
    }
  }

  const stmt = db.prepare(`
    INSERT INTO movies (title, year, genre, director, writer, actors, rating, poster_url, source, imdb_id, tmdb_id, type, file_path, extra_files, user_rating, pl_title, filmweb_id, filmweb_url, rated_at, wishlist, description, cda_url, video_metadata, tmdb_collection_id, tmdb_collection_name, tmdb_collection_checked)
    VALUES (@title, @year, @genre, @director, @writer, @actors, @rating, @poster_url, @source, @imdb_id, @tmdb_id, @type, @file_path, @extra_files, @user_rating, @pl_title, @filmweb_id, @filmweb_url, @rated_at, @wishlist, @description, @cda_url, @video_metadata, @tmdb_collection_id, @tmdb_collection_name, @tmdb_collection_checked)
  `);
  const result = stmt.run({
    ...movie,
    writer: movie.writer ?? null,
    actors: movie.actors ?? null,
    file_path: movie.file_path ?? null,
    extra_files: movie.extra_files ?? null,
    user_rating: movie.user_rating ?? null,
    pl_title: movie.pl_title ?? null,
    filmweb_id: movie.filmweb_id ?? null,
    filmweb_url: movie.filmweb_url ?? null,
    rated_at: movie.rated_at ?? null,
    wishlist: movie.wishlist ?? 0,
    description: movie.description ?? null,
    cda_url: movie.cda_url ?? null,
    video_metadata: movie.video_metadata ?? null,
    tmdb_collection_id: movie.tmdb_collection_id ?? null,
    tmdb_collection_name: movie.tmdb_collection_name ?? null,
    tmdb_collection_checked: movie.tmdb_collection_checked ?? (movie.tmdb_collection_id ? 1 : 0),
  });
  return Number(result.lastInsertRowid);
}

const ORDER_BY_USER_RATING =
  "ORDER BY CASE WHEN user_rating IS NOT NULL AND user_rating < 5 THEN 1 ELSE 0 END, user_rating DESC, created_at DESC";

function buildFtsQuery(query: string): string | null {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens) return null;
  return tokens.map((token) => `"${token.replace(/"/g, "\"\"")}"*`).join(" ");
}

export function getMovies(db: Database.Database, type?: string, query?: string): Movie[] {
  const normalizedQuery = query?.trim();
  if (normalizedQuery) {
    const ftsQuery = buildFtsQuery(normalizedQuery);
    if (!ftsQuery) return [];

    const whereType = type ? "AND movies.type = ?" : "";
    const params = type ? [ftsQuery, type] : [ftsQuery];
    return db
      .prepare(
        `SELECT movies.*
         FROM movies
         JOIN movies_fts ON movies_fts.rowid = movies.id
         WHERE movies_fts MATCH ? ${whereType}
         ORDER BY bm25(movies_fts), movies.created_at DESC`,
      )
      .all(...params) as Movie[];
  }
  if (type) {
    return db
      .prepare(`SELECT * FROM movies WHERE type = ? ${ORDER_BY_USER_RATING}`)
      .all(type) as Movie[];
  }
  return db.prepare(`SELECT * FROM movies ${ORDER_BY_USER_RATING}`).all() as Movie[];
}

export function getDetachedMovies(db: Database.Database): Movie[] {
  return db
    .prepare("SELECT * FROM movies WHERE (file_path IS NULL OR file_path = '') ORDER BY title ASC")
    .all() as Movie[];
}

export function getMovie(db: Database.Database, id: number): Movie | null {
  return (
    (db.prepare("SELECT * FROM movies WHERE id = ?").get(id) as Movie | undefined) ??
    null
  );
}

export interface TmdbMetadataUpdate {
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  rating: number | null;
  poster_url: string | null;
  imdb_id: string | null;
  pl_title?: string | null;
  description?: string | null;
}

export function updateMovieTmdbMetadata(
  db: Database.Database,
  id: number,
  metadata: TmdbMetadataUpdate,
  refreshedAt = Math.floor(Date.now() / 1000),
): Movie | null {
  const result = db.prepare(`
    UPDATE movies SET
      title = ?,
      year = ?,
      genre = ?,
      director = ?,
      writer = ?,
      actors = ?,
      rating = ?,
      poster_url = ?,
      imdb_id = ?,
      pl_title = ?,
      description = ?,
      source = 'tmdb',
      tmdb_refreshed_at = ?
    WHERE id = ?
      AND tmdb_id IS NOT NULL
  `).run(
    metadata.title,
    metadata.year,
    metadata.genre,
    metadata.director,
    metadata.writer,
    metadata.actors,
    metadata.rating,
    metadata.poster_url,
    metadata.imdb_id,
    metadata.pl_title ?? null,
    metadata.description ?? null,
    refreshedAt,
    id,
  );
  if (result.changes === 0) return null;
  return getMovie(db, id);
}

export function getStaleTmdbMovies(
  db: Database.Database,
  limit: number,
  olderThanSeconds: number,
): Pick<Movie, "id" | "tmdb_id" | "tmdb_refreshed_at">[] {
  return db
    .prepare(
      `SELECT id, tmdb_id, tmdb_refreshed_at
       FROM movies
       WHERE tmdb_id IS NOT NULL
         AND type = 'movie'
         AND (tmdb_refreshed_at IS NULL OR tmdb_refreshed_at < ?)
       ORDER BY tmdb_refreshed_at IS NOT NULL, tmdb_refreshed_at ASC, id ASC
       LIMIT ?`,
    )
    .all(olderThanSeconds, limit) as Pick<Movie, "id" | "tmdb_id" | "tmdb_refreshed_at">[];
}

export function deleteMovie(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM movies WHERE id = ?").run(id);
}

export function getTvEpisodeProgress(
  db: Database.Database,
  movieId: number,
): TvEpisodeProgress[] {
  return db
    .prepare(
      `SELECT * FROM tv_episode_progress
       WHERE movie_id = ?
       ORDER BY season_number DESC, episode_number DESC`,
    )
    .all(movieId) as TvEpisodeProgress[];
}

export function setTvEpisodeWatched(
  db: Database.Database,
  movieId: number,
  seasonNumber: number,
  episodeNumber: number,
): TvEpisodeProgress {
  db.prepare(
    `INSERT INTO tv_episode_progress (movie_id, season_number, episode_number, watched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(movie_id, season_number, episode_number) DO UPDATE SET
       watched_at = excluded.watched_at,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(movieId, seasonNumber, episodeNumber, new Date().toISOString());

  return db
    .prepare(
      `SELECT * FROM tv_episode_progress
       WHERE movie_id = ? AND season_number = ? AND episode_number = ?`,
    )
    .get(movieId, seasonNumber, episodeNumber) as TvEpisodeProgress;
}

export function deleteTvEpisodeProgress(
  db: Database.Database,
  movieId: number,
  seasonNumber: number,
  episodeNumber: number,
): void {
  db.prepare(
    `DELETE FROM tv_episode_progress
     WHERE movie_id = ? AND season_number = ? AND episode_number = ?`,
  ).run(movieId, seasonNumber, episodeNumber);
}

export function getCachedEngine<T = unknown>(
  db: Database.Database,
  engine: string,
  movieCount: number,
  maxAgeHours = 24,
): T[] | null {
  const row = db
    .prepare(
      "SELECT data, movie_count, created_at FROM recommendation_cache WHERE engine = ?",
    )
    .get(engine) as
    | { data: string; movie_count: number; created_at: string }
    | undefined;
  if (!row || row.movie_count !== movieCount) return null;
  const ageMs = Date.now() - new Date(row.created_at + "Z").getTime();
  if (ageMs > maxAgeHours * 60 * 60 * 1000) return null;
  try {
    return JSON.parse(row.data) as T[];
  } catch {
    return null;
  }
}

export function setCachedEngine<T = unknown>(
  db: Database.Database,
  engine: string,
  data: T[],
  movieCount: number,
): void {
  db.prepare(
    "INSERT OR REPLACE INTO recommendation_cache (engine, data, movie_count, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
  ).run(engine, JSON.stringify(data), movieCount);
}

export function clearCachedEngine(
  db: Database.Database,
  engine?: string,
): void {
  if (engine) {
    db.prepare("DELETE FROM recommendation_cache WHERE engine = ?").run(engine);
    db.prepare("DELETE FROM recommended_movies WHERE engine = ?").run(engine);
  } else {
    db.prepare("DELETE FROM recommendation_cache").run();
    db.prepare("DELETE FROM recommended_movies").run();
  }
}

export interface RecommendedMovie {
  id: number;
  tmdb_id: number;
  engine: string;
  reason: string;
  title: string;
  year: number | null;
  genre: string | null;
  rating: number | null;
  poster_url: string | null;
  pl_title: string | null;
  cda_url: string | null;
  description: string | null;
  trace: RecommendationTrace | null;
  cda_last_status: number | null;
  cda_last_checked_at: string | null;
  created_at: string;
}

interface RecommendedMovieRow {
  id: number;
  tmdb_id: number;
  engine: string;
  reason: string;
  title: string;
  year: number | null;
  genre: string | null;
  rating: number | null;
  poster_url: string | null;
  pl_title: string | null;
  cda_url: string | null;
  description: string | null;
  trace: string | null;
  cda_last_status: number | null;
  cda_last_checked_at: string | null;
  created_at: string;
}

function parseRecommendationTrace(
  trace: string | null,
): RecommendationTrace | null {
  if (!trace) return null;
  try {
    return JSON.parse(trace) as RecommendationTrace;
  } catch {
    return null;
  }
}

function mapRecommendedMovieRow(row: RecommendedMovieRow): RecommendedMovie {
  return {
    ...row,
    trace: parseRecommendationTrace(row.trace),
  };
}

export function saveRecommendedMovies(
  db: Database.Database,
  engine: string,
  reason: string,
  movies: {
    tmdb_id: number;
    title: string;
    year: number | null;
    genre: string | null;
    rating: number | null;
    poster_url: string | null;
    reason?: string;
    trace?: RecommendationTrace;
  }[],
): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url, trace)
    VALUES (@tmdb_id, @engine, @reason, @title, @year, @genre, @rating, @poster_url, @trace)
  `);
  for (const m of movies) {
    stmt.run({
      ...m,
      engine,
      reason: m.reason ?? reason,
      trace: m.trace ? JSON.stringify(m.trace) : null,
    });
  }
}

export function pruneRecommendedMovies(
  db: Database.Database,
  engine: string,
  keepTmdbIds: number[],
): void {
  if (keepTmdbIds.length === 0) {
    db.prepare("DELETE FROM recommended_movies WHERE engine = ?").run(engine);
    return;
  }
  const placeholders = keepTmdbIds.map(() => "?").join(", ");
  db.prepare(
    `DELETE FROM recommended_movies WHERE engine = ? AND tmdb_id NOT IN (${placeholders})`,
  ).run(engine, ...keepTmdbIds);
}

export function getRecommendedMovies(
  db: Database.Database,
  engine?: string,
): RecommendedMovie[] {
  // Prefer a TMDb poster from the movies table over whatever was stored at scrape time
  // (CDA thumbnails look bad; auto-link updates movies.poster_url to TMDb quality).
  const cols = `
    rm.id, rm.tmdb_id, rm.engine, rm.reason, rm.title, rm.year, rm.genre, rm.rating,
    COALESCE(
      (SELECT m.poster_url FROM movies m
       WHERE m.tmdb_id = rm.tmdb_id AND m.poster_url LIKE 'https://image.tmdb.org%'
       LIMIT 1),
      rm.poster_url
    ) AS poster_url,
    rm.pl_title, rm.cda_url, rm.description, rm.trace,
    rm.cda_last_status, rm.cda_last_checked_at, rm.created_at
  `;
  if (engine) {
    return (db
      .prepare(`SELECT ${cols} FROM recommended_movies rm WHERE rm.engine = ? ORDER BY rm.rating DESC`)
      .all(engine) as RecommendedMovieRow[]).map(mapRecommendedMovieRow);
  }
  return (db
    .prepare(`SELECT ${cols} FROM recommended_movies rm ORDER BY rm.engine, rm.rating DESC`)
    .all() as RecommendedMovieRow[]).map(mapRecommendedMovieRow);
}

export function updateRecommendedMovie(
  db: Database.Database,
  tmdbId: number,
  updates: { pl_title?: string; cda_url?: string; description?: string },
): void {
  if (updates.pl_title) {
    db.prepare(
      "UPDATE recommended_movies SET pl_title = ? WHERE tmdb_id = ?",
    ).run(updates.pl_title, tmdbId);
  }
  if (updates.cda_url) {
    db.prepare(
      "UPDATE recommended_movies SET cda_url = ? WHERE tmdb_id = ?",
    ).run(updates.cda_url, tmdbId);
  }
  if (updates.description) {
    db.prepare(
      "UPDATE recommended_movies SET description = ? WHERE tmdb_id = ?",
    ).run(updates.description, tmdbId);
  }
}

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(
  db: Database.Database,
  key: string,
  value: string,
): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

export function getMovieByFilePath(
  db: Database.Database,
  filePath: string,
): Movie | null {
  return (
    (db
      .prepare("SELECT * FROM movies WHERE file_path = ?")
      .get(filePath) as Movie) ?? null
  );
}

export function dismissRecommendation(
  db: Database.Database,
  tmdbId: number,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO dismissed_recommendations (tmdb_id) VALUES (?)",
  ).run(tmdbId);
}

export function getDismissedIds(db: Database.Database): Set<number> {
  const rows = db
    .prepare("SELECT tmdb_id FROM dismissed_recommendations")
    .all() as { tmdb_id: number }[];
  return new Set(rows.map((r) => r.tmdb_id));
}

export type RecommendationEventType = "open" | "add" | "dismiss";

export function recordRecommendationEvent(
  db: Database.Database,
  tmdbId: number,
  engine: string,
  event: RecommendationEventType,
): void {
  db.prepare(
    "INSERT INTO recommendation_events (tmdb_id, engine, event) VALUES (?, ?, ?)",
  ).run(tmdbId, engine, event);
}

// Records that a set of tmdb_ids were surfaced by an engine. On the first call
// per (tmdb_id, engine) inserts a row with shown_count=1; subsequent calls
// increment shown_count and refresh last_shown_at for ranking penalties.
export function recordImpressions(
  db: Database.Database,
  engine: string,
  tmdbIds: number[],
): void {
  if (!engine || tmdbIds.length === 0) return;
  const stmt = db.prepare(`
    INSERT INTO recommendation_impressions (tmdb_id, engine, shown_count, last_shown_at)
    VALUES (?, ?, 1, unixepoch())
    ON CONFLICT(tmdb_id, engine) DO UPDATE SET
      shown_count = shown_count + 1,
      last_shown_at = unixepoch()
  `);
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(id, engine);
  });
  tx(tmdbIds);
}

// Returns a map of tmdb_id → shown_count for the given engine, restricted to
// impressions whose last_shown_at falls within the past `withinDays` window.
// Impressions older than that decay to zero so titles eventually cycle back.
export function getImpressionCounts(
  db: Database.Database,
  engine: string,
  tmdbIds: number[],
  withinDays = 14,
): Map<number, number> {
  if (!engine || tmdbIds.length === 0) return new Map();
  const placeholders = tmdbIds.map(() => "?").join(",");
  const cutoff = Math.floor(Date.now() / 1000) - withinDays * 24 * 60 * 60;
  const rows = db
    .prepare(
      `SELECT tmdb_id, shown_count FROM recommendation_impressions
       WHERE engine = ? AND last_shown_at >= ? AND tmdb_id IN (${placeholders})`,
    )
    .all(engine, cutoff, ...tmdbIds) as { tmdb_id: number; shown_count: number }[];
  return new Map(rows.map((r) => [r.tmdb_id, r.shown_count]));
}

export function getRatedTmdbIds(
  db: Database.Database,
  type = "movie",
): Set<number> {
  const rows = db
    .prepare(`
      SELECT DISTINCT tmdb_id
      FROM movies
      WHERE tmdb_id IS NOT NULL
        AND user_rating IS NOT NULL
        AND user_rating > 0
        AND type = ?
    `)
    .all(type) as { tmdb_id: number }[];
  return new Set(rows.map((r) => r.tmdb_id));
}
