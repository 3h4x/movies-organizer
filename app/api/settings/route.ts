import { NextRequest } from "next/server";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { rescheduleCdaJob } from "@/lib/cda-scheduler";
import { invalidateMemCache } from "@/lib/epg-fetch";
import { rescheduleEpgJob } from "@/lib/epg-scheduler";

const VALID_REFRESH_INTERVAL_HOURS = [0, 6, 12, 24];

export async function GET() {
  const db = getDb();
  const libraryPath = getSetting(db, "library_path");
  const groupOrder = getSetting(db, "rec_group_order");
  const recConfig = getSetting(db, "rec_config");
  const dbKey = getSetting(db, "tmdb_api_key");
  const envKey = process.env.TMDB_API_KEY;
  const disabledEngines = getSetting(db, "disabled_engines");
  const backupEnabled = getSetting(db, "backup_enabled");
  const cdaIntervalStr = getSetting(db, "cda_refresh_interval_hours");
  const cdaMovieCountStr = getSetting(db, "cda_movie_count");
  return Response.json({
    library_path: libraryPath,
    rec_group_order: groupOrder ? JSON.parse(groupOrder) : [],
    rec_config: recConfig ? JSON.parse(recConfig) : null,
    tmdb_api_key_set: !!(envKey || dbKey),
    tmdb_api_key_source: envKey ? "env" : dbKey ? "db" : null,
    disabled_engines: disabledEngines ? JSON.parse(disabledEngines) : [],
    backup_enabled: backupEnabled !== "false",
    cda_refresh_interval_hours: cdaIntervalStr ? parseInt(cdaIntervalStr, 10) : 0,
    cda_last_refresh: getSetting(db, "cda_last_refresh"),
    cda_movie_count: cdaMovieCountStr ? parseInt(cdaMovieCountStr, 10) : null,
    cda_refresh_status: (getSetting(db, "cda_refresh_status") ?? "idle") as
      | "idle"
      | "running"
      | "error",
    cda_dead_link_count: (() => {
      const v = getSetting(db, "cda_dead_link_count");
      return v ? parseInt(v, 10) : null;
    })(),
    cda_health_last_run: getSetting(db, "cda_health_last_run"),
    epg_url: getSetting(db, "epg_url") ?? "",
    epg_enabled: getSetting(db, "epg_enabled") !== "false",
    epg_refresh_interval_hours: (() => {
      const v = getSetting(db, "epg_refresh_interval_hours");
      return v ? parseInt(v, 10) : 0;
    })(),
    epg_last_refresh: getSetting(db, "epg_last_refresh") ?? null,
    epg_status: (getSetting(db, "epg_status") ?? "idle") as "idle" | "running" | "error",
    tv_hide_unrated: getSetting(db, "tv_hide_unrated") !== "false",
  });
}

export async function PATCH(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const db = getDb();
  const body = await request.json();
  try {
  if (body.rec_group_order) {
    setSetting(db, "rec_group_order", JSON.stringify(body.rec_group_order));
  }
  if (body.rec_config) {
    setSetting(db, "rec_config", JSON.stringify(body.rec_config));
  }
  if (body.disabled_engines) {
    setSetting(db, "disabled_engines", JSON.stringify(body.disabled_engines));
  }
  if (typeof body.library_path === "string") {
    if (body.library_path.trim()) {
      setSetting(db, "library_path", body.library_path.trim());
    } else {
      db.prepare("DELETE FROM settings WHERE key = ?").run("library_path");
    }
  }
  if (typeof body.backup_enabled === "boolean") {
    setSetting(db, "backup_enabled", body.backup_enabled ? "true" : "false");
  }
  if (body.cda_refresh_interval_hours !== undefined) {
    const val = Number(body.cda_refresh_interval_hours);
    if (!VALID_REFRESH_INTERVAL_HOURS.includes(val)) {
      return Response.json(
        { error: "cda_refresh_interval_hours must be 0, 6, 12, or 24" },
        { status: 400 },
      );
    }
    setSetting(db, "cda_refresh_interval_hours", String(val));
    rescheduleCdaJob(db);
  }
  if (typeof body.tmdb_api_key === "string") {
    if (body.tmdb_api_key.trim()) {
      setSetting(db, "tmdb_api_key", body.tmdb_api_key.trim());
    } else {
      db.prepare("DELETE FROM settings WHERE key = ?").run("tmdb_api_key");
    }
  }
  if (typeof body.epg_url === "string") {
    if (body.epg_url.trim()) {
      setSetting(db, "epg_url", body.epg_url.trim());
    } else {
      db.prepare("DELETE FROM settings WHERE key = ?").run("epg_url");
    }
    invalidateMemCache();
  }
  if (typeof body.epg_enabled === "boolean") {
    setSetting(db, "epg_enabled", body.epg_enabled ? "true" : "false");
  }
  if (typeof body.tv_hide_unrated === "boolean") {
    setSetting(db, "tv_hide_unrated", body.tv_hide_unrated ? "true" : "false");
  }
  if (body.epg_refresh_interval_hours !== undefined) {
    const val = Number(body.epg_refresh_interval_hours);
    if (!VALID_REFRESH_INTERVAL_HOURS.includes(val)) {
      return Response.json(
        { error: "epg_refresh_interval_hours must be 0, 6, 12, or 24" },
        { status: 400 },
      );
    }
    setSetting(db, "epg_refresh_interval_hours", String(val));
    rescheduleEpgJob(db);
  }
  return Response.json({ ok: true });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "SQLITE_READONLY") {
      return Response.json({ error: "Database is read-only — check file permissions on the server" }, { status: 500 });
    }
    return Response.json({ error: e?.message || "Failed to save settings" }, { status: 500 });
  }
}
