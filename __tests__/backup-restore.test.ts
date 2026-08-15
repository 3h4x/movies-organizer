import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDb } from "@/lib/db";

const RESTORE_SCRIPT = path.join(process.cwd(), "scripts", "restore-db.sh");

function names(
  db: Database.Database,
  type: "table" | "index",
): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = ?")
      .all(type) as { name: string }[]
  ).map((row) => row.name);
}

describe("backup restore drill", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "filmpick-restore-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("restores a SQLite backup and verifies initDb on the restored file", async () => {
    const sourcePath = path.join(tempDir, "source.db");
    const backupPath = path.join(tempDir, "backup.db");
    const restoredPath = path.join(tempDir, "restored.db");

    const source = new Database(sourcePath);
    initDb(source);
    source
      .prepare(
        "INSERT INTO movies (title, year, genre, director, rating, source, type) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("Restore Drill", 2026, "Drama", "CI", 7.5, "test", "movie");
    await source.backup(backupPath);
    source.close();

    execFileSync("bash", [RESTORE_SCRIPT, backupPath, restoredPath], {
      stdio: "pipe",
    });

    const restored = new Database(restoredPath);
    try {
      expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
      initDb(restored);

      expect(
        restored.prepare("SELECT COUNT(*) FROM movies").pluck().get(),
      ).toBeGreaterThan(0);
      expect(restored.pragma("schema_version", { simple: true })).toEqual(
        expect.any(Number),
      );

      expect(names(restored, "table")).toEqual(
        expect.arrayContaining([
          "movies",
          "settings",
          "_migrations",
          "dismissed_recommendations",
          "recommendation_cache",
          "recommended_movies",
          "recommendation_events",
          "recommendation_impressions",
          "tv_episode_progress",
          "movies_fts",
        ]),
      );
      expect(names(restored, "index")).toEqual(
        expect.arrayContaining([
          "idx_movies_tmdb_id",
          "idx_movies_tmdb_collection_id",
          "idx_movies_file_path",
          "idx_movies_user_rating",
          "idx_movies_title_year",
          "idx_movies_type",
          "idx_movies_source",
          "idx_recommended_movies_tmdb_id",
          "idx_rec_events_tmdb_engine",
          "idx_rec_impressions_engine",
          "idx_tv_episode_progress_movie",
        ]),
      );
    } finally {
      restored.close();
    }
  });

  it("refuses to clobber an existing target unless forced", async () => {
    const sourcePath = path.join(tempDir, "source.db");
    const backupPath = path.join(tempDir, "backup.db");
    const targetPath = path.join(tempDir, "target.db");

    const source = new Database(sourcePath);
    initDb(source);
    await source.backup(backupPath);
    source.close();
    fs.writeFileSync(targetPath, "existing");

    expect(() =>
      execFileSync("bash", [RESTORE_SCRIPT, backupPath, targetPath], {
        stdio: "pipe",
      }),
    ).toThrow();

    execFileSync("bash", [RESTORE_SCRIPT, backupPath, targetPath, "--force"], {
      stdio: "pipe",
    });

    const restored = new Database(targetPath, { readonly: true });
    try {
      expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      restored.close();
    }
  });

  it("does not replace the target when backup validation fails", () => {
    const invalidBackupPath = path.join(tempDir, "invalid-backup.db");
    const targetPath = path.join(tempDir, "target.db");

    const target = new Database(targetPath);
    initDb(target);
    target
      .prepare(
        "INSERT INTO movies (title, year, genre, director, rating, source, type) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("Keep Me", 2026, "Drama", "CI", 8.5, "test", "movie");
    target.close();

    fs.writeFileSync(invalidBackupPath, "not a sqlite database");

    expect(() =>
      execFileSync(
        "bash",
        [RESTORE_SCRIPT, invalidBackupPath, targetPath, "--force"],
        { stdio: "pipe" },
      ),
    ).toThrow();

    const preserved = new Database(targetPath, { readonly: true });
    try {
      expect(preserved.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(
        preserved
          .prepare("SELECT title FROM movies WHERE title = ?")
          .pluck()
          .get("Keep Me"),
      ).toBe("Keep Me");
    } finally {
      preserved.close();
    }
  });
});
