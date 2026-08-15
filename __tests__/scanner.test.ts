// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

import { scanDirectory, scanDirectoryGenerator } from "@/lib/scanner";

// ---------------------------------------------------------------------------
// Helpers — build a real temp directory structure
// ---------------------------------------------------------------------------

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "filmpick-scanner-test-"));
}

function touch(dir: string, ...segments: string[]): string {
  const fullPath = path.join(dir, ...segments);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, "");
  return fullPath;
}

// ---------------------------------------------------------------------------
// scanDirectory
// ---------------------------------------------------------------------------

describe("scanDirectory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for an empty directory", () => {
    expect(scanDirectory(tmpDir)).toEqual([]);
  });

  it("picks up a video file at the root", () => {
    touch(tmpDir, "Inception (2010).mkv");
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].filename).toBe("Inception (2010).mkv");
    expect(results[0].parsedTitle).toBe("Inception");
    expect(results[0].parsedYear).toBe(2010);
  });

  it("recurses into subdirectories", () => {
    touch(tmpDir, "Sci-Fi", "Dune.2021.mkv");
    touch(tmpDir, "Drama", "The.Godfather.1972.avi");
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.parsedTitle);
    expect(titles).toContain("Dune");
    expect(titles).toContain("The Godfather");
  });

  it("ignores non-video files", () => {
    touch(tmpDir, "readme.txt");
    touch(tmpDir, "cover.jpg");
    touch(tmpDir, "subtitles.srt");
    touch(tmpDir, "Movie.mkv");
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].filename).toBe("Movie.mkv");
  });

  it("supports all recognised video extensions", () => {
    const exts = [".mp4", ".mkv", ".avi", ".wmv", ".m4v", ".mov", ".flv", ".webm"];
    for (const ext of exts) {
      touch(tmpDir, `Movie${ext}`);
    }
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(exts.length);
  });

  it("ignores dot-files and dot-directories", () => {
    touch(tmpDir, ".hidden", "Movie.mkv");
    touch(tmpDir, ".DS_Store");
    const results = scanDirectory(tmpDir);
    // .hidden/Movie.mkv should be skipped
    expect(results).toHaveLength(0);
  });

  it("ignores entries starting with '#'", () => {
    touch(tmpDir, "#recycle", "Movie.mkv");
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("ignores entries containing '#snapshot'", () => {
    touch(tmpDir, "dir#snapshot", "Movie.mkv");
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("ignores the 'Home Movies' directory", () => {
    touch(tmpDir, "Home Movies", "Family.mkv");
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("ignores the 'iphotos' directory", () => {
    touch(tmpDir, "iphotos", "Photo.mkv");
    const results = scanDirectory(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips video files where parsedTitle is empty", () => {
    // A file made of only release tags has an empty title after parsing
    touch(tmpDir, "1080p.BluRay.x264.mkv");
    const results = scanDirectory(tmpDir);
    // Scanner only yields when title is truthy
    expect(results.every((r) => r.parsedTitle.length > 0)).toBe(true);
  });

  it("returns correct filePath for nested files", () => {
    touch(tmpDir, "Action", "Die.Hard.1988.mkv");
    const results = scanDirectory(tmpDir);
    expect(results[0].filePath).toBe(path.join(tmpDir, "Action", "Die.Hard.1988.mkv"));
  });

  it("returns null parsedYear when filename has no year", () => {
    touch(tmpDir, "Casablanca.mkv");
    const results = scanDirectory(tmpDir);
    expect(results[0].parsedYear).toBeNull();
  });

  it("handles an inaccessible subdirectory gracefully", () => {
    const subDir = path.join(tmpDir, "restricted");
    fs.mkdirSync(subDir);
    touch(tmpDir, "Good.Movie.mkv");
    // Remove read permission from subdirectory
    fs.chmodSync(subDir, 0o000);

    let results: ReturnType<typeof scanDirectory>;
    try {
      results = scanDirectory(tmpDir);
      // Should still find the top-level file
      expect(results).toHaveLength(1);
    } finally {
      // Restore permissions so cleanup works
      fs.chmodSync(subDir, 0o755);
    }
  });
});

// ---------------------------------------------------------------------------
// scanDirectoryGenerator
// ---------------------------------------------------------------------------

describe("scanDirectoryGenerator", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("yields ScannedFile objects lazily", () => {
    touch(tmpDir, "Interstellar (2014).mp4");
    const gen = scanDirectoryGenerator(tmpDir);
    const first = gen.next();
    expect(first.done).toBe(false);
    expect(first.value.parsedTitle).toBe("Interstellar");
    expect(first.value.parsedYear).toBe(2014);
    expect(gen.next().done).toBe(true);
  });

  it("yields nothing for an empty directory", () => {
    const gen = scanDirectoryGenerator(tmpDir);
    expect(gen.next().done).toBe(true);
  });

  it("yields multiple files across subdirectories", () => {
    touch(tmpDir, "a", "MovieA.mkv");
    touch(tmpDir, "b", "MovieB.avi");
    const results = [...scanDirectoryGenerator(tmpDir)];
    expect(results).toHaveLength(2);
  });
});
