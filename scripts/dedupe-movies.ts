// tamtam inspected 2026-05-21
/**
 * Merge movies that share a tmdb_id but live in separate rows. These typically
 * appear when a Filmweb import created a row before the scanner found the
 * matching local file (or vice versa). Picks a canonical row per group
 * (prefers a row with a local file, then higher user_rating, then lower id)
 * and merges the others into it via lib/dedup.ts.
 *
 * Usage:
 *   pnpm dlx tsx scripts/dedupe-movies.ts            # apply
 *   pnpm dlx tsx scripts/dedupe-movies.ts --dry-run  # preview only
 */

import Database from "better-sqlite3";
import path from "path";
import { dedupeMoviesByTmdbId } from "@/lib/dedup";
import type { Movie } from "@/lib/db";

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dbPath = path.join(process.cwd(), "data", "movies.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const groups = db
    .prepare(
      `SELECT tmdb_id, GROUP_CONCAT(id) AS ids
       FROM movies
       WHERE tmdb_id IS NOT NULL
       GROUP BY tmdb_id
       HAVING COUNT(*) > 1`,
    )
    .all() as { tmdb_id: number; ids: string }[];

  console.log(`Found ${groups.length} tmdb_id group(s) with duplicates.`);
  for (const g of groups) {
    const rows = db
      .prepare(
        `SELECT id, title, year, source, user_rating, file_path
         FROM movies WHERE tmdb_id = ? ORDER BY id`,
      )
      .all(g.tmdb_id) as Pick<Movie, "id" | "title" | "year" | "source" | "user_rating" | "file_path">[];
    console.log(
      `  tmdb_id=${g.tmdb_id}: ${rows
        .map(
          (r) =>
            `[${r.id} ${r.source ?? "?"} ${r.title} (${r.year ?? "?"}) ur=${r.user_rating ?? "-"}${r.file_path ? " file" : ""}]`,
        )
        .join(" + ")}`,
    );
  }

  if (dryRun) {
    console.log("\nDry-run mode — no changes written.");
    db.close();
    return;
  }

  if (groups.length === 0) {
    console.log("Nothing to merge.");
    db.close();
    return;
  }

  const result = dedupeMoviesByTmdbId(db);
  console.log(
    `\nMerged ${result.groupsMerged} group(s), removed ${result.rowsRemoved} row(s).`,
  );
  if (result.failures.length > 0) {
    console.error("Failures:");
    for (const f of result.failures) {
      console.error(`  tmdb_id=${f.tmdb_id}: ${f.error}`);
    }
    db.close();
    process.exit(1);
  }
  db.close();
}

main();
