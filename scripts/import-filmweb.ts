/**
 * One-time import of a Filmweb ratings export into the FilmPick SQLite DB.
 * Run once after exporting your ratings from Filmweb. Not intended for
 * repeated or scheduled use — Filmweb is not synced automatically.
 *
 * Usage: pnpm dlx tsx scripts/import-filmweb.ts <path-to-json> [--enrich]
 *
 * Optionally pass --enrich to fetch TMDb poster/genre data (requires TMDB_API_KEY).
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

interface FilmwebEntry {
  timestamp: number;
  favorite: boolean | null;
  user_rating: number;
  global_rating: number;
  global_rating_count: number;
  original_title: string;
  pl_title: string;
  year: number;
  movie_id: number;
  url: string;
  date: string;
}

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

async function searchTmdb(
  title: string,
  year: number,
): Promise<{
  tmdb_id: number;
  genre: string;
  poster_url: string | null;
  rating: number;
} | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&year=${year}&language=en-US&page=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const match = data.results?.[0];
  if (!match) return null;

  return {
    tmdb_id: match.id,
    genre: (match.genre_ids || [])
      .map((id: number) => TMDB_GENRE_MAP[id] || "Unknown")
      .join(", "),
    poster_url: match.poster_path
      ? `https://image.tmdb.org/t/p/w300${match.poster_path}`
      : null,
    rating: Math.round(match.vote_average * 10) / 10,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonPath = args.find((a) => !a.startsWith("--"));
  const enrich = args.includes("--enrich");

  if (!jsonPath) {
    console.error(
      "Usage: pnpm dlx tsx scripts/import-filmweb.ts <path-to-json> [--enrich]",
    );
    process.exit(1);
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  const dbPath = path.join(process.cwd(), "data", "movies.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Ensure tables exist
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Add filmweb columns if missing
  try {
    db.exec("ALTER TABLE movies ADD COLUMN filmweb_id INTEGER");
  } catch {}
  try {
    db.exec("ALTER TABLE movies ADD COLUMN filmweb_url TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE movies ADD COLUMN user_rating REAL");
  } catch {}
  try {
    db.exec("ALTER TABLE movies ADD COLUMN pl_title TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE movies ADD COLUMN rated_at TEXT");
  } catch {}

  const data: FilmwebEntry[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`Loaded ${data.length} entries from ${jsonPath}`);

  const insertStmt = db.prepare(`
    INSERT INTO movies (title, year, genre, director, rating, poster_url, source, imdb_id, tmdb_id, type, filmweb_id, filmweb_url, user_rating, pl_title, rated_at)
    VALUES (@title, @year, @genre, @director, @rating, @poster_url, @source, @imdb_id, @tmdb_id, @type, @filmweb_id, @filmweb_url, @user_rating, @pl_title, @rated_at)
  `);

  const updateFilmwebStmt = db.prepare(`
    UPDATE movies SET filmweb_id = @filmweb_id, filmweb_url = @filmweb_url,
      user_rating = @user_rating, pl_title = @pl_title, rated_at = @rated_at,
      source = CASE WHEN source IS NULL THEN 'filmweb' ELSE source END
    WHERE id = @id
  `);

  const existsByFilmwebStmt = db.prepare("SELECT id FROM movies WHERE filmweb_id = ?");
  const existsByTmdbStmt = db.prepare("SELECT id FROM movies WHERE tmdb_id = ?");
  const existsByTitleYearStmt = db.prepare("SELECT id FROM movies WHERE LOWER(title) = LOWER(?) AND year IS ?");

  let added = 0;
  let merged = 0;
  let skipped = 0;
  let enriched = 0;

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];

    // Skip if already imported by filmweb_id
    if (existsByFilmwebStmt.get(entry.movie_id)) {
      skipped++;
      continue;
    }

    let genre: string | null = null;
    let posterUrl: string | null = null;
    let tmdbId: number | null = null;
    let tmdbRating: number | null = null;

    // Optionally enrich with TMDb
    if (enrich) {
      try {
        const tmdb = await searchTmdb(entry.original_title, entry.year);
        if (tmdb) {
          genre = tmdb.genre;
          posterUrl = tmdb.poster_url;
          tmdbId = tmdb.tmdb_id;
          tmdbRating = tmdb.rating;
          enriched++;
        }
        // Rate limit: ~40 req/s allowed, be conservative
        if (i % 40 === 39) await new Promise((r) => setTimeout(r, 1000));
      } catch {}
    }

    // Check for existing movie by tmdb_id or title+year to avoid duplicates
    const existingRow =
      (tmdbId ? (existsByTmdbStmt.get(tmdbId) as { id: number } | undefined) : undefined) ??
      (existsByTitleYearStmt.get(entry.original_title, entry.year) as { id: number } | undefined);

    if (existingRow) {
      updateFilmwebStmt.run({
        id: existingRow.id,
        filmweb_id: entry.movie_id,
        filmweb_url: entry.url,
        user_rating: entry.user_rating,
        pl_title: entry.pl_title,
        rated_at: entry.date,
      });
      merged++;
      continue;
    }

    insertStmt.run({
      title: entry.original_title,
      year: entry.year,
      genre,
      director: null,
      rating: tmdbRating ?? Math.round(entry.global_rating * 10) / 10,
      poster_url: posterUrl,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: tmdbId,
      type: "movie",
      filmweb_id: entry.movie_id,
      filmweb_url: entry.url,
      user_rating: entry.user_rating,
      pl_title: entry.pl_title,
      rated_at: entry.date,
    });
    added++;

    if (added % 100 === 0) {
      console.log(
        `  Progress: ${added} added, ${skipped} skipped${enrich ? `, ${enriched} enriched` : ""}...`,
      );
    }
  }

  db.close();
  console.log(
    `\nDone! Added: ${added}, Merged: ${merged}, Skipped: ${skipped}${enrich ? `, Enriched: ${enriched}` : ""}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
