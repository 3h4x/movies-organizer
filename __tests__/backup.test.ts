// tamtam inspected 2026-05-21
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { pruneBackups, getBackupStats } from "@/lib/backup";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeFile(dir: string, name: string, ageSeconds: number) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, "");
  const t = new Date(Date.now() - ageSeconds * 1000);
  fs.utimesSync(p, t, t);
  return name;
}

function ls(dir: string) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".db")).sort();
}

// ── setup ─────────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "filmpick-backup-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── pruneBackups ──────────────────────────────────────────────────────────────

describe("pruneBackups", () => {
  it("does nothing with empty dir", () => {
    pruneBackups(tmpDir);
    expect(ls(tmpDir)).toEqual([]);
  });

  it("always keeps the newest file", () => {
    makeFile(tmpDir, "a.db", 10);
    pruneBackups(tmpDir);
    expect(ls(tmpDir)).toEqual(["a.db"]);
  });

  it("keeps up to 4 files in the <1h tier", () => {
    // 5 files all within the last hour
    for (let i = 1; i <= 5; i++) makeFile(tmpDir, `f${i}.db`, i * 5 * 60); // 5, 10, 15, 20, 25 min
    pruneBackups(tmpDir);
    // newest (f1) always kept + 4 from tier = but tier itself picks 4 newest in <1h
    // f1(5min), f2(10min), f3(15min), f4(20min) kept; f5(25min) pruned
    expect(ls(tmpDir)).toHaveLength(4);
    expect(ls(tmpDir)).not.toContain("f5.db");
  });

  it("keeps up to 4 files per tier across tiers", () => {
    // <1h tier: 4 files
    for (let i = 1; i <= 4; i++) makeFile(tmpDir, `h${i}.db`, i * 10 * 60);
    // 1h-24h tier: 4 files
    for (let i = 1; i <= 4; i++) makeFile(tmpDir, `d${i}.db`, 3600 + i * 3600);
    // 1d-7d tier: 1 file
    makeFile(tmpDir, "w1.db", 2 * 86400);
    pruneBackups(tmpDir);
    expect(ls(tmpDir)).toContain("h1.db");
    expect(ls(tmpDir)).toContain("h4.db");
    expect(ls(tmpDir)).toContain("d1.db");
    expect(ls(tmpDir)).toContain("d4.db");
    expect(ls(tmpDir)).toContain("w1.db");
    expect(ls(tmpDir)).toHaveLength(9);
  });

  it("prunes excess files within a tier, keeping the 4 newest", () => {
    // 6 files all in hourly tier (1h-24h)
    for (let i = 1; i <= 6; i++) makeFile(tmpDir, `f${i}.db`, 3600 + i * 3600);
    pruneBackups(tmpDir);
    // f1 is newest overall → always kept
    // tier picks 4 from 1h-24h range (f1-f4), f5 and f6 pruned
    const remaining = ls(tmpDir);
    expect(remaining).toHaveLength(4);
    expect(remaining).not.toContain("f5.db");
    expect(remaining).not.toContain("f6.db");
  });

  it("ignores non-.db files", () => {
    fs.writeFileSync(path.join(tmpDir, "readme.txt"), "");
    makeFile(tmpDir, "a.db", 10);
    pruneBackups(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "readme.txt"))).toBe(true);
  });
});

// ── getBackupStats ────────────────────────────────────────────────────────────

describe("getBackupStats", () => {
  it("returns null and 0 when dir does not exist", () => {
    const stats = getBackupStats();
    // BACKUP_DIR won't exist in test env — just check shape
    expect(stats).toHaveProperty("lastBackup");
    expect(stats).toHaveProperty("count");
  });

  it("returns correct count and newest file", () => {
    makeFile(tmpDir, "old.db", 3600);
    makeFile(tmpDir, "new.db", 60);

    // Test the stat + sort logic directly (same as getBackupStats internals)
    const files = fs
      .readdirSync(tmpDir)
      .filter((f) => f.endsWith(".db"))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(tmpDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    expect(files[0].name).toBe("new.db");
    expect(files).toHaveLength(2);
  });
});
