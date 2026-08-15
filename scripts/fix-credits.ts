// tamtam inspected 2026-05-21
/**
 * Re-fetch director/writer/actors from TMDb for all movies with a tmdb_id.
 *
 * Usage: eval "$(bioenv load)" && pnpm dlx tsx scripts/fix-credits.ts [--dry-run]
 */

import Database from "better-sqlite3";
import path from "path";
import { getTmdbMovieDetails } from "@/lib/tmdb";

const DRY_RUN = process.argv.includes("--dry-run");

if (!process.env.TMDB_API_KEY) {
  console.error('TMDB_API_KEY not set. Run: eval "$(bioenv load)"');
  process.exit(1);
}

const dbPath = path.join(__dirname, "../data/movies.db");
const db = new Database(dbPath);

interface MovieRow {
  id: number;
  title: string;
  year: number | null;
  tmdb_id: number;
  director: string | null;
  writer: string | null;
  actors: string | null;
}

async function main() {
  const movies = db
    .prepare(
      "SELECT id, title, year, tmdb_id, director, writer, actors FROM movies WHERE tmdb_id IS NOT NULL",
    )
    .all() as MovieRow[];

  console.log(
    `Found ${movies.length} movies with tmdb_id. ${DRY_RUN ? "(DRY RUN)" : ""}`,
  );

  const update = db.prepare(
    "UPDATE movies SET director = ?, writer = ?, actors = ? WHERE id = ?",
  );
  let fixed = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    try {
      const credits = await getTmdbMovieDetails(m.tmdb_id);
      if (!credits.director && !credits.writer && !credits.actors) {
        failed++;
        continue;
      }

      const changed =
        credits.director !== m.director ||
        credits.writer !== m.writer ||
        credits.actors !== m.actors;
      if (changed) {
        if (!DRY_RUN) {
          update.run(credits.director, credits.writer, credits.actors, m.id);
        }
        console.log(
          `[${i + 1}/${movies.length}] FIXED "${m.title}" (${m.year}): ${m.director} -> ${credits.director}`,
        );
        fixed++;
      } else {
        unchanged++;
      }

      // Rate limit: ~3 req/sec
      if ((i + 1) % 3 === 0) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`[${i + 1}/${movies.length}] ERROR "${m.title}": ${e}`);
      failed++;
    }
  }

  console.log(
    `\nDone. Fixed: ${fixed}, Unchanged: ${unchanged}, Failed: ${failed}`,
  );
}

main().finally(() => {
  db.close();
});
