import type Database from "better-sqlite3";
import {
  getMovie,
  getStaleTmdbMovies,
  updateMovieTmdbMetadata,
  type Movie,
} from "@/lib/db";
import { getTmdbMovieSnapshot } from "@/lib/tmdb";

export interface RefreshMovieResult {
  movie: Movie;
  updated: boolean;
}

export async function refreshMovieTmdbMetadata(
  db: Database.Database,
  id: number,
): Promise<RefreshMovieResult | null> {
  const existing = getMovie(db, id);
  if (!existing) return null;
  if (!existing.tmdb_id) {
    throw new Error("missing_tmdb_id");
  }
  if (existing.type !== "movie") {
    throw new Error("unsupported_tmdb_refresh_type");
  }

  const snapshot = await getTmdbMovieSnapshot(existing.tmdb_id);
  if (!snapshot) {
    throw new Error("tmdb_movie_not_found");
  }

  const movie = updateMovieTmdbMetadata(db, id, snapshot);
  if (!movie) return null;
  return { movie, updated: true };
}

export interface RefreshStaleOptions {
  limit: number;
  maxAgeDays: number;
  delayMs: number;
}

export interface RefreshStaleResult {
  updated: number;
  skipped: number;
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshStaleTmdbMetadata(
  db: Database.Database,
  options: RefreshStaleOptions,
): Promise<RefreshStaleResult> {
  const cutoff = Math.floor(Date.now() / 1000) - options.maxAgeDays * 24 * 60 * 60;
  const rows = getStaleTmdbMovies(db, options.limit, cutoff);
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const result = await refreshMovieTmdbMetadata(db, row.id);
      if (result?.updated) {
        updated += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("TMDB_API_KEY not set") || error.message.includes("tmdb_api_error"))
      ) {
        throw error;
      }
      skipped += 1;
      console.warn("[tmdb-refresh] Skipped movie refresh", {
        id: row.id,
        tmdbId: row.tmdb_id,
        error,
      });
    }
    await wait(options.delayMs);
  }

  return { updated, skipped };
}
