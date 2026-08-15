// tamtam inspected 2026-05-21
import type Database from "better-sqlite3";
import type { Movie } from "@/lib/db";

const MERGEABLE_FIELDS = [
  "tmdb_id",
  "imdb_id",
  "genre",
  "director",
  "writer",
  "actors",
  "poster_url",
  "pl_title",
  "rated_at",
  "file_path",
  "source",
  "filmweb_id",
  "filmweb_url",
  "cda_url",
  "type",
  "year",
  "extra_files",
] as const satisfies readonly (keyof Movie)[];

// Merges `source` into `target` and deletes `source`. Strategy:
//  - user_rating / rating: take max
//  - description: take longer
//  - genre / extra_files: union
//  - file_path: prefer target's; if both differ, source's path is moved into extra_files
//  - wishlist: 1 wins
//  - other listed fields: non-null wins, target wins on conflict
// Returns the surviving target id.
export function mergeMovies(
  db: Database.Database,
  sourceId: number,
  targetId: number,
): { ok: true; targetId: number } | { ok: false; error: string; status: 400 | 404 | 500 } {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { ok: false, error: "Invalid IDs", status: 400 };
  }

  const source = db
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(sourceId) as Movie | undefined;
  const target = db
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(targetId) as Movie | undefined;

  if (!source || !target) {
    return { ok: false, error: "Movie(s) not found", status: 404 };
  }

  const updates: Partial<Movie> = {};

  if (source.user_rating || target.user_rating) {
    updates.user_rating =
      Math.max(
        Number(source.user_rating || 0),
        Number(target.user_rating || 0),
      ) || null;
  }

  if (source.wishlist && !target.wishlist) {
    updates.wishlist = 1;
  }

  if (source.rating || target.rating) {
    updates.rating =
      Math.max(Number(source.rating || 0), Number(target.rating || 0)) || null;
  }

  if (source.description || target.description) {
    const sDesc = source.description || "";
    const tDesc = target.description || "";
    updates.description = sDesc.length > tDesc.length ? sDesc : tDesc;
  }

  const cols = db.pragma("table_info(movies)") as { name: string }[];
  const existingCols = new Set(cols.map((c) => c.name));

  for (const f of MERGEABLE_FIELDS) {
    if (existingCols.has(f) && !target[f] && source[f]) {
      (updates as Record<keyof Movie, Movie[keyof Movie]>)[f] = source[f];
    }
  }

  if (existingCols.has("genre") && source.genre && target.genre) {
    const sGenres = source.genre.split(",").map((g) => g.trim());
    const tGenres = target.genre.split(",").map((g) => g.trim());
    const allGenres = Array.from(new Set([...sGenres, ...tGenres])).filter(
      Boolean,
    );
    updates.genre = allGenres.join(", ");
  }

  // Combine extra_files; also absorb source.file_path when target already has its own
  const sourceExtras: string[] = source.extra_files
    ? JSON.parse(source.extra_files)
    : [];
  const targetExtras: string[] = target.extra_files
    ? JSON.parse(target.extra_files)
    : [];
  const combinedExtras = new Set([...targetExtras, ...sourceExtras]);
  if (source.file_path && target.file_path && source.file_path !== target.file_path) {
    combinedExtras.add(source.file_path);
  }
  const extras = Array.from(combinedExtras).filter(Boolean);
  if (extras.length > 0) {
    updates.extra_files = JSON.stringify(extras);
  }

  for (const f in updates) {
    const k = f as keyof Movie;
    if (updates[k] === target[k]) {
      delete updates[k];
    }
  }

  if (
    ("file_path" in updates || "extra_files" in updates) &&
    existingCols.has("video_metadata")
  ) {
    updates.video_metadata = null;
  }

  try {
    const updateKeys = Object.keys(updates);
    const updateParams = Object.values(updates);

    const transaction = db.transaction(() => {
      if (updates.file_path) {
        db.prepare("UPDATE movies SET file_path = NULL WHERE id = ?").run(
          sourceId,
        );
      }
      if (updates.title && updates.year) {
        db.prepare(
          "UPDATE movies SET title = 'merged-placeholder', year = NULL WHERE id = ?",
        ).run(sourceId);
      }

      if (updateKeys.length > 0) {
        const setClause = updateKeys.map((k) => `${k} = ?`).join(", ");
        db.prepare(`UPDATE movies SET ${setClause} WHERE id = ?`).run(
          ...updateParams,
          targetId,
        );
      }
      db.prepare("DELETE FROM movies WHERE id = ?").run(sourceId);
    });

    transaction();
    return { ok: true, targetId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to merge movies",
      status: 500,
    };
  }
}

// Walks groups of movies sharing the same tmdb_id and merges them into a single
// canonical row per group. The canonical row is chosen to preserve the most
// useful state: a row with a local file beats one without; otherwise the row
// with the higher user_rating wins; ties break on the lower id (the older entry).
export function dedupeMoviesByTmdbId(
  db: Database.Database,
): { groupsMerged: number; rowsRemoved: number; failures: { tmdb_id: number; error: string }[] } {
  const groups = db
    .prepare(
      `SELECT tmdb_id, GROUP_CONCAT(id) AS ids
       FROM movies
       WHERE tmdb_id IS NOT NULL
       GROUP BY tmdb_id
       HAVING COUNT(*) > 1`,
    )
    .all() as { tmdb_id: number; ids: string }[];

  let groupsMerged = 0;
  let rowsRemoved = 0;
  const failures: { tmdb_id: number; error: string }[] = [];

  for (const group of groups) {
    const ids = group.ids.split(",").map((s) => Number(s));
    const rows = db
      .prepare(
        `SELECT * FROM movies WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids) as Movie[];

    rows.sort((a, b) => {
      const af = a.file_path ? 1 : 0;
      const bf = b.file_path ? 1 : 0;
      if (af !== bf) return bf - af;
      const ar = Number(a.user_rating || 0);
      const br = Number(b.user_rating || 0);
      if (ar !== br) return br - ar;
      return a.id - b.id;
    });

    const [target, ...rest] = rows;
    let mergedAny = false;
    for (const source of rest) {
      const res = mergeMovies(db, source.id, target.id);
      if (res.ok) {
        rowsRemoved++;
        mergedAny = true;
      } else {
        failures.push({ tmdb_id: group.tmdb_id, error: res.error });
      }
    }
    if (mergedAny) groupsMerged++;
  }

  return { groupsMerged, rowsRemoved, failures };
}
