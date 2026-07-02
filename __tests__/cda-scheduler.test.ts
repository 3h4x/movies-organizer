// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, getSetting, setSetting } from "@/lib/db";

vi.mock("@/lib/cda-fetch", () => ({
  fetchAndStoreCdaMovies: vi.fn(),
}));

vi.mock("@/lib/cda-health", () => ({
  runCdaHealthCheckPass: vi.fn(),
}));

import { fetchAndStoreCdaMovies } from "@/lib/cda-fetch";
import { runCdaHealthCheckPass } from "@/lib/cda-health";
import {
  runCdaRefreshNow,
  rescheduleCdaJob,
  initCdaScheduler,
  runCdaHealthCheckNow,
  rescheduleCdaHealthJob,
} from "@/lib/cda-scheduler";

const TEST_DB = path.join(__dirname, "test-cda-scheduler.db");

describe("cda-scheduler", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  describe("runCdaRefreshNow", () => {
    it("sets cda_refresh_status to running immediately", () => {
      vi.mocked(fetchAndStoreCdaMovies).mockReturnValue(new Promise(() => {}));

      runCdaRefreshNow(db);

      expect(getSetting(db, "cda_refresh_status")).toBe("running");
    });

    it("does not call fetchAndStoreCdaMovies if already running", () => {
      setSetting(db, "cda_refresh_status", "running");

      runCdaRefreshNow(db);

      expect(fetchAndStoreCdaMovies).not.toHaveBeenCalled();
    });

    it("sets status to idle and updates last_refresh and movie_count on success", async () => {
      vi.mocked(fetchAndStoreCdaMovies).mockResolvedValue(undefined);

      runCdaRefreshNow(db);
      await vi.waitFor(() =>
        expect(getSetting(db, "cda_refresh_status")).toBe("idle"),
      );

      expect(getSetting(db, "cda_last_refresh")).not.toBeNull();
      expect(getSetting(db, "cda_movie_count")).toBe("0");
    });

    it("sets status to error on failure", async () => {
      vi.mocked(fetchAndStoreCdaMovies).mockRejectedValue(new Error("network error"));

      runCdaRefreshNow(db);
      await vi.waitFor(() =>
        expect(getSetting(db, "cda_refresh_status")).toBe("error"),
      );
    });
  });

  describe("rescheduleCdaJob", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(fetchAndStoreCdaMovies).mockReturnValue(new Promise(() => {}));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not fire when interval is 0", () => {
      setSetting(db, "cda_refresh_interval_hours", "0");

      rescheduleCdaJob(db);
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      expect(fetchAndStoreCdaMovies).not.toHaveBeenCalled();
    });

    it("fires after 6 hours when interval is 6", () => {
      setSetting(db, "cda_refresh_interval_hours", "6");

      rescheduleCdaJob(db);
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);

      expect(fetchAndStoreCdaMovies).toHaveBeenCalledTimes(1);
    });

    it("cancels old timer when rescheduled to 0", () => {
      setSetting(db, "cda_refresh_interval_hours", "6");

      rescheduleCdaJob(db);

      setSetting(db, "cda_refresh_interval_hours", "0");
      rescheduleCdaJob(db);

      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(fetchAndStoreCdaMovies).not.toHaveBeenCalled();
    });

    it("uses only the latest interval after repeated reschedules", () => {
      setSetting(db, "cda_refresh_interval_hours", "6");

      rescheduleCdaJob(db);
      setSetting(db, "cda_refresh_interval_hours", "12");
      rescheduleCdaJob(db);

      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(fetchAndStoreCdaMovies).not.toHaveBeenCalled();

      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(fetchAndStoreCdaMovies).toHaveBeenCalledOnce();
    });

    it("does not install a SIGTERM handler during scheduling", () => {
      const onceSpy = vi.spyOn(process, "once");
      setSetting(db, "cda_refresh_interval_hours", "6");

      rescheduleCdaJob(db);
      rescheduleCdaJob(db);

      expect(onceSpy).not.toHaveBeenCalledWith("SIGTERM", expect.any(Function));
      onceSpy.mockRestore();
    });

    it("does not fire when no interval setting is stored", () => {
      // No cda_refresh_interval_hours set — falls back to 0
      rescheduleCdaJob(db);
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      expect(fetchAndStoreCdaMovies).not.toHaveBeenCalled();
    });

  });

  describe("runCdaHealthCheckNow", () => {
    it("sets cda_health_status to running immediately", () => {
      vi.mocked(runCdaHealthCheckPass).mockReturnValue(new Promise(() => {}));

      runCdaHealthCheckNow(db);

      expect(getSetting(db, "cda_health_status")).toBe("running");
    });

    it("does not start a pass if one is already running", () => {
      setSetting(db, "cda_health_status", "running");

      runCdaHealthCheckNow(db);

      expect(runCdaHealthCheckPass).not.toHaveBeenCalled();
    });

    it("sets status to idle on success", async () => {
      vi.mocked(runCdaHealthCheckPass).mockResolvedValue({
        checked: 0,
        dead: 0,
        recovered: 0,
      });

      runCdaHealthCheckNow(db);
      await vi.waitFor(() =>
        expect(getSetting(db, "cda_health_status")).toBe("idle"),
      );
    });

    it("sets status to error on failure", async () => {
      vi.mocked(runCdaHealthCheckPass).mockRejectedValue(new Error("boom"));

      runCdaHealthCheckNow(db);
      await vi.waitFor(() =>
        expect(getSetting(db, "cda_health_status")).toBe("error"),
      );
    });
  });

  describe("rescheduleCdaHealthJob", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(runCdaHealthCheckPass).mockReturnValue(new Promise(() => {}));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not fire when interval is explicitly 0", () => {
      setSetting(db, "cda_health_interval_hours", "0");

      rescheduleCdaHealthJob(db);
      vi.advanceTimersByTime(48 * 60 * 60 * 1000);

      expect(runCdaHealthCheckPass).not.toHaveBeenCalled();
    });

    it("fires on the default 12h cadence when no interval is configured", () => {
      rescheduleCdaHealthJob(db);
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);

      expect(runCdaHealthCheckPass).toHaveBeenCalledTimes(1);
    });
  });

  describe("initCdaScheduler", () => {
    it("resets stale running status to idle on startup", () => {
      setSetting(db, "cda_refresh_status", "running");

      initCdaScheduler(db);

      expect(getSetting(db, "cda_refresh_status")).toBe("idle");
    });

    it("does not change status when status is idle", () => {
      setSetting(db, "cda_refresh_status", "idle");

      initCdaScheduler(db);

      expect(getSetting(db, "cda_refresh_status")).toBe("idle");
    });

    it("does not change status when status is error", () => {
      setSetting(db, "cda_refresh_status", "error");

      initCdaScheduler(db);

      expect(getSetting(db, "cda_refresh_status")).toBe("error");
    });

    it("calls rescheduleCdaJob — fires timer at configured interval", () => {
      vi.useFakeTimers();
      vi.mocked(fetchAndStoreCdaMovies).mockReturnValue(new Promise(() => {}));
      setSetting(db, "cda_refresh_interval_hours", "24");

      initCdaScheduler(db);
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      expect(fetchAndStoreCdaMovies).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });
  });
});
