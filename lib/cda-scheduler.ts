// tamtam inspected 2026-05-21
import type Database from "better-sqlite3";
import { getSetting, setSetting } from "@/lib/db";
import { fetchAndStoreCdaMovies } from "@/lib/cda-fetch";
import { runCdaHealthCheckPass } from "@/lib/cda-health";

// Default cadence for the dead-link health check when no interval is configured.
const DEFAULT_HEALTH_INTERVAL_HOURS = 12;

let activeTimer: ReturnType<typeof setInterval> | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let shutdownHandlerInstalled = false;

function clearCdaTimer(): void {
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
}

function clearCdaHealthTimer(): void {
  if (healthTimer !== null) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function clearAllCdaTimers(): void {
  clearCdaTimer();
  clearCdaHealthTimer();
}

export function runCdaRefreshNow(db: Database.Database): void {
  if (getSetting(db, "cda_refresh_status") === "running") return;
  setSetting(db, "cda_refresh_status", "running");

  void (async () => {
    try {
      await fetchAndStoreCdaMovies(db);
      const row = db
        .prepare("SELECT COUNT(*) as c FROM recommended_movies WHERE engine = 'cda'")
        .get() as { c: number };
      setSetting(db, "cda_last_refresh", new Date().toISOString());
      setSetting(db, "cda_movie_count", String(row.c));
      setSetting(db, "cda_refresh_status", "idle");
    } catch (err) {
      console.error("[cda] Refresh failed:", err);
      setSetting(db, "cda_refresh_status", "error");
    }
  })();
}

export function runCdaHealthCheckNow(db: Database.Database): void {
  if (getSetting(db, "cda_health_status") === "running") return;
  setSetting(db, "cda_health_status", "running");

  void (async () => {
    try {
      const result = await runCdaHealthCheckPass(db);
      if (result.dead > 0 || result.recovered > 0) {
        console.log(
          `[cda] health check: ${result.checked} checked, ${result.dead} newly dead, ${result.recovered} recovered`,
        );
      }
      setSetting(db, "cda_health_status", "idle");
    } catch (err) {
      console.error("[cda] Health check failed:", err);
      setSetting(db, "cda_health_status", "error");
    }
  })();
}

export function rescheduleCdaHealthJob(db: Database.Database): void {
  clearCdaHealthTimer();

  const intervalStr = getSetting(db, "cda_health_interval_hours");
  const hours = intervalStr
    ? parseInt(intervalStr, 10)
    : DEFAULT_HEALTH_INTERVAL_HOURS;
  if (hours === 0) return;

  const ms = hours * 60 * 60 * 1000;
  healthTimer = setInterval(() => {
    runCdaHealthCheckNow(db);
  }, ms);
}

export function rescheduleCdaJob(db: Database.Database): void {
  clearCdaTimer();

  const intervalStr = getSetting(db, "cda_refresh_interval_hours");
  const hours = intervalStr ? parseInt(intervalStr, 10) : 0;
  if (hours === 0) return;

  const ms = hours * 60 * 60 * 1000;
  activeTimer = setInterval(() => {
    runCdaRefreshNow(db);
  }, ms);
}

export function initCdaScheduler(db: Database.Database): void {
  if (!shutdownHandlerInstalled) {
    process.once("SIGTERM", clearAllCdaTimers);
    shutdownHandlerInstalled = true;
  }

  // Reset stale "running" status left over from a previous crash
  if (getSetting(db, "cda_refresh_status") === "running") {
    setSetting(db, "cda_refresh_status", "idle");
  }
  if (getSetting(db, "cda_health_status") === "running") {
    setSetting(db, "cda_health_status", "idle");
  }
  rescheduleCdaJob(db);
  rescheduleCdaHealthJob(db);
}
