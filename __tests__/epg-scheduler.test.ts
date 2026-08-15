// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, getSetting, setSetting } from "@/lib/db";

vi.mock("@/lib/epg-fetch", () => ({
  fetchAndCacheEpg: vi.fn(),
}));

import { runEpgRefreshNow, rescheduleEpgJob, initEpgScheduler } from "@/lib/epg-scheduler";
import { fetchAndCacheEpg } from "@/lib/epg-fetch";

const TEST_DB = path.join(__dirname, "test-epg-scheduler.db");

describe("EPG scheduler", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.useRealTimers();
  });

  describe("runEpgRefreshNow", () => {
    it("calls fetchAndCacheEpg when status is not running", () => {
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });
      runEpgRefreshNow(db);
      expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
      expect(fetchAndCacheEpg).toHaveBeenCalledWith(db);
    });

    it("does NOT call fetchAndCacheEpg when status is running", () => {
      setSetting(db, "epg_status", "running");
      runEpgRefreshNow(db);
      expect(fetchAndCacheEpg).not.toHaveBeenCalled();
    });

    it("calls fetchAndCacheEpg when status is idle", () => {
      setSetting(db, "epg_status", "idle");
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });
      runEpgRefreshNow(db);
      expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
    });

    it("calls fetchAndCacheEpg when status is error", () => {
      setSetting(db, "epg_status", "error");
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });
      runEpgRefreshNow(db);
      expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
    });
  });

  describe("rescheduleEpgJob", () => {
    it("does not schedule when epg_enabled is false", () => {
      setSetting(db, "epg_enabled", "false");
      setSetting(db, "epg_refresh_interval_hours", "6");
      rescheduleEpgJob(db);
      vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1);
      expect(fetchAndCacheEpg).not.toHaveBeenCalled();
    });

    it("does not schedule when interval is 0", () => {
      setSetting(db, "epg_enabled", "true");
      setSetting(db, "epg_refresh_interval_hours", "0");
      rescheduleEpgJob(db);
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(fetchAndCacheEpg).not.toHaveBeenCalled();
    });

    it("does not schedule when interval is missing", () => {
      setSetting(db, "epg_enabled", "true");
      rescheduleEpgJob(db);
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(fetchAndCacheEpg).not.toHaveBeenCalled();
    });

    it("schedules periodic refresh when enabled with valid interval", () => {
      setSetting(db, "epg_enabled", "true");
      setSetting(db, "epg_refresh_interval_hours", "6");
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });
      rescheduleEpgJob(db);
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
    });

    it("fires multiple times at the configured interval", () => {
      setSetting(db, "epg_enabled", "true");
      setSetting(db, "epg_refresh_interval_hours", "12");
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });
      rescheduleEpgJob(db);
      vi.advanceTimersByTime(12 * 60 * 60 * 1000 * 3);
      expect(fetchAndCacheEpg).toHaveBeenCalledTimes(3);
    });

    it("cancels previous timer when called again", () => {
      setSetting(db, "epg_enabled", "true");
      setSetting(db, "epg_refresh_interval_hours", "6");
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });
      rescheduleEpgJob(db);
      // Reschedule with disabled — the old timer should be cleared
      setSetting(db, "epg_enabled", "false");
      rescheduleEpgJob(db);
      vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1);
      expect(fetchAndCacheEpg).not.toHaveBeenCalled();
    });

    it("uses only the latest interval after repeated reschedules", () => {
      setSetting(db, "epg_enabled", "true");
      setSetting(db, "epg_refresh_interval_hours", "6");
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });

      rescheduleEpgJob(db);
      setSetting(db, "epg_refresh_interval_hours", "12");
      rescheduleEpgJob(db);

      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(fetchAndCacheEpg).not.toHaveBeenCalled();

      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
    });

    it("does not install a SIGTERM handler during scheduling", () => {
      const onceSpy = vi.spyOn(process, "once");
      setSetting(db, "epg_enabled", "true");
      setSetting(db, "epg_refresh_interval_hours", "6");

      rescheduleEpgJob(db);
      rescheduleEpgJob(db);

      expect(onceSpy).not.toHaveBeenCalledWith("SIGTERM", expect.any(Function));
      onceSpy.mockRestore();
    });
  });

  describe("initEpgScheduler", () => {
    it("resets running status to idle on init", () => {
      setSetting(db, "epg_status", "running");
      initEpgScheduler(db);
      expect(getSetting(db, "epg_status")).toBe("idle");
    });

    it("does not change status when not running", () => {
      setSetting(db, "epg_status", "error");
      initEpgScheduler(db);
      expect(getSetting(db, "epg_status")).toBe("error");
    });

    it("calls rescheduleEpgJob (schedules the timer)", () => {
      setSetting(db, "epg_enabled", "true");
      setSetting(db, "epg_refresh_interval_hours", "24");
      vi.mocked(fetchAndCacheEpg).mockResolvedValue({
        channels: [],
        programs: [],
        cachedAt: new Date().toISOString(),
        epgUrl: "https://example.com/epg.xml.gz",
      });
      initEpgScheduler(db);
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
    });
  });
});
