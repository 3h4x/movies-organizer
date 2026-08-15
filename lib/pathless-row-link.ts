import { enrichMovieMetadata, type MovieInput } from "@/lib/db";
import type { ScannedFile } from "@/lib/scanner";
import { cleanTitle } from "@/lib/utils";
import type Database from "better-sqlite3";

interface PathlessRow {
  id: number;
  title: string;
  year: number | null;
}

// Every field is optional: callers frequently know only the tmdb_id, and the
// link path already falls back per field when one is missing.
type PathlessRowTmdbMatch = Partial<
  Pick<
    MovieInput,
    "genre" | "imdb_id" | "poster_url" | "rating" | "tmdb_id" | "year"
  >
>;

// Try to attach a scanned file to an existing pathless DB row before
// inserting a new one. Returns the linked row id when a row was linked.
//
// Match priority:
//   1. tmdb_id (when TMDb gave us one)
//   2. exact LOWER(title) + year IS ? (handles NULL year correctly)
//   3. cleanTitle equality + year tolerance (±1)
export function linkToExistingPathlessRow(
  db: Database.Database,
  file: ScannedFile,
  tmdbMatch: PathlessRowTmdbMatch | null,
): number | null {
  const link = (id: number) => {
    db.prepare(
      "UPDATE movies SET file_path = ?, video_metadata = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(file.filePath, id);
    if (tmdbMatch) {
      enrichMovieMetadata(db, id, {
        title: file.parsedTitle,
        year: tmdbMatch.year ?? file.parsedYear,
        genre: tmdbMatch.genre ?? null,
        director: null,
        rating: tmdbMatch.rating ?? null,
        poster_url: tmdbMatch.poster_url ?? null,
        source: null,
        imdb_id: tmdbMatch.imdb_id ?? null,
        tmdb_id: tmdbMatch.tmdb_id ?? null,
        type: "movie",
      });
    }
    return id;
  };

  if (tmdbMatch?.tmdb_id) {
    const byTmdb = db
      .prepare(
        "SELECT id FROM movies WHERE tmdb_id = ? AND (file_path IS NULL OR file_path = '')",
      )
      .get(tmdbMatch.tmdb_id) as { id: number } | undefined;
    if (byTmdb) {
      return link(byTmdb.id);
    }
  }

  const byTitleYear = db
    .prepare(
      "SELECT id FROM movies WHERE LOWER(title) = LOWER(?) AND year IS ? AND (file_path IS NULL OR file_path = '')",
    )
    .get(file.parsedTitle, file.parsedYear) as { id: number } | undefined;
  if (byTitleYear) {
    return link(byTitleYear.id);
  }

  const wantTitle = cleanTitle(file.parsedTitle).toLowerCase();
  if (!wantTitle) return null;

  const candidates = db
    .prepare(
      "SELECT id, title, year FROM movies WHERE file_path IS NULL OR file_path = ''",
    )
    .all() as PathlessRow[];

  for (const candidate of candidates) {
    if (cleanTitle(candidate.title).toLowerCase() !== wantTitle) continue;
    if (file.parsedYear != null && candidate.year != null) {
      if (Math.abs(candidate.year - file.parsedYear) > 1) continue;
    }
    return link(candidate.id);
  }

  return null;
}
