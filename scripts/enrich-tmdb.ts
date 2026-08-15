/**
 * Enrich existing movies in DB with TMDb poster/genre data.
 * Only updates movies that have no poster_url yet.
 *
 * Usage: npx tsx scripts/enrich-tmdb.ts
 * Requires TMDB_API_KEY env var.
 */

import Database from "better-sqlite3";
import path from "path";

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

async function searchTmdb(apiKey: string, title: string, year: number | null) {
  async function searchWithYear(y: number | null) {
    let url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&language=en-US&page=1`;
    if (y) url += `&year=${y}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  }

  // Try original year first
  let data = await searchWithYear(year);

  // If no match and year is provided, try +/- 1 year
  if ((!data || !data.results?.length) && year) {
    data = await searchWithYear(year + 1);
    if (!data || !data.results?.length) {
      data = await searchWithYear(year - 1);
    }
  }

  // If still no match, try without year
  if (!data || !data.results?.length) {
    data = await searchWithYear(null);
  }

  const match = data?.results?.[0];
  if (!match) return null;

  return {
    tmdb_id: match.id,
    genre: (match.genre_ids || [])
      .map((id: number) => TMDB_GENRE_MAP[id] || "Unknown")
      .join(", "),
    poster_url: match.poster_path
      ? `https://image.tmdb.org/t/p/w300${match.poster_path}`
      : null,
  };
}

async function main() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error("TMDB_API_KEY env var required");
    process.exit(1);
  }

  const dbPath = path.join(process.cwd(), "data", "movies.db");
  const db = new Database(dbPath);

  const movies = db
    .prepare("SELECT id, title, year FROM movies WHERE poster_url IS NULL")
    .all() as { id: number; title: string; year: number | null }[];

  console.log(`Found ${movies.length} movies without posters`);

  const updateStmt = db.prepare(
    "UPDATE movies SET poster_url = ?, genre = COALESCE(genre, ?), tmdb_id = COALESCE(tmdb_id, ?) WHERE id = ?",
  );

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    try {
      const tmdb = await searchTmdb(apiKey, movie.title, movie.year);
      if (tmdb?.poster_url) {
        updateStmt.run(tmdb.poster_url, tmdb.genre, tmdb.tmdb_id, movie.id);
        enriched++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    // Rate limit
    if (i % 35 === 34) await new Promise((r) => setTimeout(r, 1000));

    if ((i + 1) % 50 === 0) {
      console.log(
        `  Progress: ${i + 1}/${movies.length} (${enriched} enriched, ${failed} no match)`,
      );
    }
  }

  db.close();
  console.log(
    `\nDone! Enriched: ${enriched}, No match: ${failed}, Total: ${movies.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
