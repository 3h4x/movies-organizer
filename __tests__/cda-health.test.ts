import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, getSetting } from "@/lib/db";
import {
  checkCdaLink,
  isCdaLinkDead,
  runCdaHealthCheckPass,
} from "@/lib/cda-health";

const TEST_DB = path.join(__dirname, "test-cda-health.db");

function insertCdaRow(
  db: Database.Database,
  row: {
    tmdb_id: number;
    title: string;
    cda_url: string;
    cda_last_status?: number | null;
    cda_last_checked_at?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO recommended_movies
       (tmdb_id, engine, reason, title, cda_url, cda_last_status, cda_last_checked_at)
     VALUES (?, 'cda', 'CDA', ?, ?, ?, ?)`,
  ).run(
    row.tmdb_id,
    row.title,
    row.cda_url,
    row.cda_last_status ?? null,
    row.cda_last_checked_at ?? null,
  );
}

describe("cda-health", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.restoreAllMocks();
    delete (global as { fetch?: unknown }).fetch;
  });

  describe("isCdaLinkDead", () => {
    it("treats 404 and 410 as dead, everything else as alive", () => {
      expect(isCdaLinkDead(404)).toBe(true);
      expect(isCdaLinkDead(410)).toBe(true);
      expect(isCdaLinkDead(200)).toBe(false);
      expect(isCdaLinkDead(500)).toBe(false);
      expect(isCdaLinkDead(0)).toBe(false);
      expect(isCdaLinkDead(null)).toBe(false);
    });
  });

  describe("checkCdaLink", () => {
    it("returns the HTTP status from a HEAD request", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ status: 404 });
      global.fetch = fetchMock as typeof fetch;

      const status = await checkCdaLink("https://www.cda.pl/video/dead/vfilm");

      expect(status).toBe(404);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://www.cda.pl/video/dead/vfilm",
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("returns 0 on a network error (inconclusive, not dead)", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network")) as typeof fetch;

      const status = await checkCdaLink("https://www.cda.pl/video/x/vfilm");

      expect(status).toBe(0);
      expect(isCdaLinkDead(status)).toBe(false);
    });
  });

  describe("runCdaHealthCheckPass", () => {
    it("detects dead links and persists status + timestamp", async () => {
      insertCdaRow(db, { tmdb_id: 1, title: "Gone", cda_url: "https://cda.pl/a/vfilm" });
      global.fetch = vi.fn().mockResolvedValue({ status: 404 }) as typeof fetch;

      const result = await runCdaHealthCheckPass(db, { delayMs: 0 });

      expect(result.checked).toBe(1);
      expect(result.dead).toBe(1);
      const row = db
        .prepare("SELECT cda_last_status, cda_last_checked_at FROM recommended_movies WHERE tmdb_id = 1")
        .get() as { cda_last_status: number; cda_last_checked_at: string };
      expect(row.cda_last_status).toBe(404);
      expect(row.cda_last_checked_at).not.toBeNull();
      expect(getSetting(db, "cda_dead_link_count")).toBe("1");
    });

    it("recovers a previously-dead link that returns 200 again", async () => {
      insertCdaRow(db, {
        tmdb_id: 2,
        title: "Back",
        cda_url: "https://cda.pl/b/vfilm",
        cda_last_status: 404,
        cda_last_checked_at: "2026-01-01T00:00:00.000Z",
      });
      global.fetch = vi.fn().mockResolvedValue({ status: 200 }) as typeof fetch;

      const result = await runCdaHealthCheckPass(db, { delayMs: 0 });

      expect(result.recovered).toBe(1);
      expect(result.dead).toBe(0);
      const row = db
        .prepare("SELECT cda_last_status FROM recommended_movies WHERE tmdb_id = 2")
        .get() as { cda_last_status: number };
      expect(row.cda_last_status).toBe(200);
      expect(getSetting(db, "cda_dead_link_count")).toBe("0");
    });

    it("checks never-checked links before already-checked ones, oldest first", async () => {
      insertCdaRow(db, {
        tmdb_id: 10,
        title: "Checked recently",
        cda_url: "https://cda.pl/recent/vfilm",
        cda_last_status: 200,
        cda_last_checked_at: "2026-06-01T00:00:00.000Z",
      });
      insertCdaRow(db, { tmdb_id: 11, title: "Never checked", cda_url: "https://cda.pl/never/vfilm" });
      insertCdaRow(db, {
        tmdb_id: 12,
        title: "Checked long ago",
        cda_url: "https://cda.pl/old/vfilm",
        cda_last_status: 200,
        cda_last_checked_at: "2026-01-01T00:00:00.000Z",
      });

      const visited: string[] = [];
      global.fetch = vi.fn().mockImplementation((url: string) => {
        visited.push(url);
        return Promise.resolve({ status: 200 });
      }) as typeof fetch;

      await runCdaHealthCheckPass(db, { delayMs: 0, linksPerTick: 2 });

      expect(visited).toEqual([
        "https://cda.pl/never/vfilm",
        "https://cda.pl/old/vfilm",
      ]);
    });

    it("limits checks per tick so traffic is spread over time", async () => {
      for (let i = 0; i < 5; i++) {
        insertCdaRow(db, { tmdb_id: 100 + i, title: `M${i}`, cda_url: `https://cda.pl/${i}/vfilm` });
      }
      const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
      global.fetch = fetchMock as typeof fetch;

      const result = await runCdaHealthCheckPass(db, { delayMs: 0, linksPerTick: 2 });

      expect(result.checked).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("waits between checks to rate-limit CDA (sleep called once per gap)", async () => {
      insertCdaRow(db, { tmdb_id: 200, title: "A", cda_url: "https://cda.pl/a/vfilm" });
      insertCdaRow(db, { tmdb_id: 201, title: "B", cda_url: "https://cda.pl/b/vfilm" });
      insertCdaRow(db, { tmdb_id: 202, title: "C", cda_url: "https://cda.pl/c/vfilm" });

      const order: string[] = [];
      global.fetch = vi.fn().mockImplementation(() => {
        order.push("fetch");
        return Promise.resolve({ status: 200 });
      }) as typeof fetch;
      const sleepMock = vi.fn().mockImplementation(() => {
        order.push("sleep");
        return Promise.resolve();
      });

      await runCdaHealthCheckPass(db, {
        delayMs: 3000,
        linksPerTick: 3,
        sleep: sleepMock,
      });

      // Three fetches, two gaps; a sleep precedes every fetch after the first.
      expect(sleepMock).toHaveBeenCalledTimes(2);
      expect(sleepMock).toHaveBeenCalledWith(3000);
      expect(order).toEqual(["fetch", "sleep", "fetch", "sleep", "fetch"]);
    });
  });
});
