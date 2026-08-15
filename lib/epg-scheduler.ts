// tamtam inspected 2026-05-21
import type Database from "better-sqlite3";
import { getSetting, setSetting } from "@/lib/db";
import { fetchAndCacheEpg } from "@/lib/epg-fetch";

let activeTimer: ReturnType<typeof setInterval> | null = null;
let shutdownHandlerInstalled = false;

function clearEpgTimer(): void {
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
}

export function runEpgRefreshNow(db: Database.Database): void {
  if (getSetting(db, "epg_status") === "running") return;

  void (async () => {
    try {
      await fetchAndCacheEpg(db);
      console.log("[epg] Refresh complete");
    } catch (err) {
      console.error("[epg] Refresh failed:", err);
    }
  })();
}

export function rescheduleEpgJob(db: Database.Database): void {
  clearEpgTimer();

  const enabled = getSetting(db, "epg_enabled");
  if (enabled === "false") return;

  const intervalStr = getSetting(db, "epg_refresh_interval_hours");
  const hours = intervalStr ? parseInt(intervalStr, 10) : 0;
  if (hours === 0) return;

  const ms = hours * 60 * 60 * 1000;
  activeTimer = setInterval(() => {
    runEpgRefreshNow(db);
  }, ms);
}

export function initEpgScheduler(db: Database.Database): void {
  if (!shutdownHandlerInstalled) {
    process.once("SIGTERM", clearEpgTimer);
    shutdownHandlerInstalled = true;
  }

  if (getSetting(db, "epg_status") === "running") {
    setSetting(db, "epg_status", "idle");
  }
  rescheduleEpgJob(db);
}
