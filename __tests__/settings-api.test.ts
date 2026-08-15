// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getSetting, setSetting } from "@/lib/db";

// Patch only getDb so the route uses our test DB; keep all other db functions real.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/lib/cda-scheduler", () => ({
  rescheduleCdaJob: vi.fn(),
}));

vi.mock("@/lib/epg-fetch", () => ({
  invalidateMemCache: vi.fn(),
}));

vi.mock("@/lib/epg-scheduler", () => ({
  rescheduleEpgJob: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/settings/route";
import { getDb } from "@/lib/db";
import { rescheduleCdaJob } from "@/lib/cda-scheduler";
import { invalidateMemCache } from "@/lib/epg-fetch";
import { rescheduleEpgJob } from "@/lib/epg-scheduler";

const TEST_DB = path.join(__dirname, "test-settings.db");

describe("settings API", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  // ── DB layer ───────────────────────────────────────────────────────────────

  describe("getSetting / setSetting (DB layer)", () => {
    it("returns null for a missing key", () => {
      expect(getSetting(db, "nonexistent")).toBeNull();
    });

    it("stores and retrieves a setting", () => {
      setSetting(db, "library_path", "/movies");
      expect(getSetting(db, "library_path")).toBe("/movies");
    });

    it("overwrites an existing setting (INSERT OR REPLACE)", () => {
      setSetting(db, "library_path", "/old");
      setSetting(db, "library_path", "/new");
      expect(getSetting(db, "library_path")).toBe("/new");
    });

    it("stores multiple settings independently", () => {
      setSetting(db, "library_path", "/movies");
      setSetting(db, "rec_config", '{"max_per_group":10}');
      expect(getSetting(db, "library_path")).toBe("/movies");
      expect(getSetting(db, "rec_config")).toBe('{"max_per_group":10}');
    });
  });

  // ── GET /api/settings ──────────────────────────────────────────────────────

  describe("GET /api/settings", () => {
    it("returns null defaults when no settings are stored", async () => {
      const res = await GET();
      const data = await res.json();
      expect(data.library_path).toBeNull();
      expect(data.rec_group_order).toEqual([]);
      expect(data.rec_config).toBeNull();
      expect(data.tmdb_api_key_set).toBe(false);
      expect(data.tmdb_api_key_source).toBeNull();
      expect(data.disabled_engines).toEqual([]);
    });

    it("returns stored library_path and disabled_engines", async () => {
      setSetting(db, "library_path", "/movies");
      setSetting(db, "disabled_engines", JSON.stringify(["genre", "actor"]));

      const res = await GET();
      const data = await res.json();
      expect(data.library_path).toBe("/movies");
      expect(data.disabled_engines).toEqual(["genre", "actor"]);
    });

    it("parses rec_config JSON and returns it as an object", async () => {
      const cfg = {
        max_per_group: 5,
        excluded_genres: ["Horror"],
        min_year: 2000,
        min_rating: null,
      };
      setSetting(db, "rec_config", JSON.stringify(cfg));

      const res = await GET();
      const data = await res.json();
      expect(data.rec_config.max_per_group).toBe(5);
      expect(data.rec_config.excluded_genres).toEqual(["Horror"]);
      expect(data.rec_config.min_year).toBe(2000);
    });

    it("parses rec_group_order JSON and returns it as an array", async () => {
      setSetting(db, "rec_group_order", JSON.stringify(["genre", "director"]));

      const res = await GET();
      const data = await res.json();
      expect(data.rec_group_order).toEqual(["genre", "director"]);
    });

    it("returns CDA defaults when no CDA settings are stored", async () => {
      const res = await GET();
      const data = await res.json();

      expect(data.cda_refresh_interval_hours).toBe(0);
      expect(data.cda_last_refresh).toBeNull();
      expect(data.cda_movie_count).toBeNull();
      expect(data.cda_refresh_status).toBe("idle");
    });

    it("returns stored CDA settings with correct types", async () => {
      setSetting(db, "cda_refresh_interval_hours", "12");
      setSetting(db, "cda_last_refresh", "2026-04-17T10:00:00.000Z");
      setSetting(db, "cda_movie_count", "500");
      setSetting(db, "cda_refresh_status", "running");

      const res = await GET();
      const data = await res.json();

      expect(data.cda_refresh_interval_hours).toBe(12);
      expect(data.cda_last_refresh).toBe("2026-04-17T10:00:00.000Z");
      expect(data.cda_movie_count).toBe(500);
      expect(data.cda_refresh_status).toBe("running");
    });

    it("reports tmdb_api_key_set=true and source=db when key is stored in DB", async () => {
      setSetting(db, "tmdb_api_key", "secret-token");

      const res = await GET();
      const data = await res.json();
      expect(data.tmdb_api_key_set).toBe(true);
      expect(data.tmdb_api_key_source).toBe("db");
    });
  });

  // ── PATCH /api/settings ────────────────────────────────────────────────────

  describe("PATCH /api/settings", () => {
    function makeRequest(body: object) {
      return new NextRequest("http://localhost/api/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });
    }

    it("returns ok:true on success", async () => {
      const res = await PATCH(makeRequest({ rec_group_order: [] }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it("persists rec_group_order", async () => {
      await PATCH(makeRequest({ rec_group_order: ["genre", "director"] }));
      expect(getSetting(db, "rec_group_order")).toBe(
        JSON.stringify(["genre", "director"]),
      );
    });

    it("persists disabled_engines", async () => {
      await PATCH(makeRequest({ disabled_engines: ["actor", "random"] }));
      expect(getSetting(db, "disabled_engines")).toBe(
        JSON.stringify(["actor", "random"]),
      );
    });

    it("persists rec_config", async () => {
      const cfg = {
        max_per_group: 8,
        excluded_genres: ["Comedy"],
        min_year: 1990,
        min_rating: 6.0,
      };
      await PATCH(makeRequest({ rec_config: cfg }));
      const stored = getSetting(db, "rec_config");
      expect(JSON.parse(stored!)).toEqual(cfg);
    });

    it("stores tmdb_api_key with leading/trailing whitespace trimmed", async () => {
      await PATCH(makeRequest({ tmdb_api_key: "  my-api-key  " }));
      expect(getSetting(db, "tmdb_api_key")).toBe("my-api-key");
    });

    it("deletes tmdb_api_key when an empty string is provided", async () => {
      setSetting(db, "tmdb_api_key", "existing-key");
      await PATCH(makeRequest({ tmdb_api_key: "" }));
      expect(getSetting(db, "tmdb_api_key")).toBeNull();
    });

    it("deletes tmdb_api_key when a whitespace-only string is provided", async () => {
      setSetting(db, "tmdb_api_key", "existing-key");
      await PATCH(makeRequest({ tmdb_api_key: "   " }));
      expect(getSetting(db, "tmdb_api_key")).toBeNull();
    });

    it("ignores unknown body fields without error", async () => {
      const res = await PATCH(makeRequest({ unknown_field: "value" }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it("persists cda_refresh_interval_hours and calls rescheduleCdaJob", async () => {
      const res = await PATCH(makeRequest({ cda_refresh_interval_hours: 12 }));
      const data = await res.json();

      expect(data.ok).toBe(true);
      expect(getSetting(db, "cda_refresh_interval_hours")).toBe("12");
      expect(rescheduleCdaJob).toHaveBeenCalledWith(db);
    });

    it("rejects invalid cda_refresh_interval_hours", async () => {
      const res = await PATCH(makeRequest({ cda_refresh_interval_hours: 7 }));

      expect(res.status).toBe(400);
      expect(getSetting(db, "cda_refresh_interval_hours")).toBeNull();
    });

    it("only updates fields that are present in the body", async () => {
      setSetting(db, "library_path", "/movies");
      await PATCH(makeRequest({ disabled_engines: ["genre"] }));
      // library_path is managed by the sync/import routes, not settings PATCH
      // but it should remain unchanged if we only send disabled_engines
      expect(getSetting(db, "library_path")).toBe("/movies");
    });

    it("persists epg_url and calls invalidateMemCache", async () => {
      const res = await PATCH(makeRequest({ epg_url: "https://example.com/epg.xml.gz" }));
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(getSetting(db, "epg_url")).toBe("https://example.com/epg.xml.gz");
      expect(invalidateMemCache).toHaveBeenCalledOnce();
    });

    it("trims epg_url whitespace", async () => {
      await PATCH(makeRequest({ epg_url: "  https://example.com/epg.xml.gz  " }));
      expect(getSetting(db, "epg_url")).toBe("https://example.com/epg.xml.gz");
    });

    it("deletes epg_url when empty string is provided", async () => {
      setSetting(db, "epg_url", "https://example.com/epg.xml.gz");
      await PATCH(makeRequest({ epg_url: "" }));
      expect(getSetting(db, "epg_url")).toBeNull();
    });

    it("persists epg_enabled=true", async () => {
      await PATCH(makeRequest({ epg_enabled: true }));
      expect(getSetting(db, "epg_enabled")).toBe("true");
    });

    it("persists epg_enabled=false", async () => {
      await PATCH(makeRequest({ epg_enabled: false }));
      expect(getSetting(db, "epg_enabled")).toBe("false");
    });

    it("persists epg_refresh_interval_hours and calls rescheduleEpgJob", async () => {
      const res = await PATCH(makeRequest({ epg_refresh_interval_hours: 12 }));
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(getSetting(db, "epg_refresh_interval_hours")).toBe("12");
      expect(rescheduleEpgJob).toHaveBeenCalledWith(db);
    });

    it("accepts 0 as valid epg_refresh_interval_hours (disabled)", async () => {
      const res = await PATCH(makeRequest({ epg_refresh_interval_hours: 0 }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "epg_refresh_interval_hours")).toBe("0");
    });

    it("rejects invalid epg_refresh_interval_hours", async () => {
      const res = await PATCH(makeRequest({ epg_refresh_interval_hours: 8 }));
      expect(res.status).toBe(400);
      expect(getSetting(db, "epg_refresh_interval_hours")).toBeNull();
    });

    it("persists backup_enabled=true", async () => {
      const res = await PATCH(makeRequest({ backup_enabled: true }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "backup_enabled")).toBe("true");
    });

    it("persists backup_enabled=false", async () => {
      const res = await PATCH(makeRequest({ backup_enabled: false }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "backup_enabled")).toBe("false");
    });

    it("persists tv_hide_unrated=true", async () => {
      const res = await PATCH(makeRequest({ tv_hide_unrated: true }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "tv_hide_unrated")).toBe("true");
    });

    it("persists tv_hide_unrated=false", async () => {
      const res = await PATCH(makeRequest({ tv_hide_unrated: false }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "tv_hide_unrated")).toBe("false");
    });

    it("persists library_path and trims whitespace", async () => {
      const res = await PATCH(makeRequest({ library_path: "  /media/movies  " }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "library_path")).toBe("/media/movies");
    });

    it("deletes library_path when an empty string is provided", async () => {
      setSetting(db, "library_path", "/media/movies");
      const res = await PATCH(makeRequest({ library_path: "" }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "library_path")).toBeNull();
    });

    it("deletes library_path when a whitespace-only string is provided", async () => {
      setSetting(db, "library_path", "/media/movies");
      const res = await PATCH(makeRequest({ library_path: "   " }));
      expect(res.status).toBe(200);
      expect(getSetting(db, "library_path")).toBeNull();
    });

    it("returns 500 with SQLITE_READONLY error message", async () => {
      db.close();
      // Reopen as read-only to simulate SQLITE_READONLY
      const roDb = new Database(TEST_DB, { readonly: true });
      vi.mocked(getDb).mockReturnValue(roDb as unknown as ReturnType<typeof getDb>);

      const res = await PATCH(makeRequest({ rec_group_order: ["genre"] }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toMatch(/read-only/i);

      roDb.close();
      // Reopen writable for afterEach cleanup
      db = new Database(TEST_DB);
      vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    });
  });

  // ── GET /api/settings — backup_enabled and tv_hide_unrated ───────────────

  describe("GET /api/settings — backup_enabled and tv_hide_unrated", () => {
    it("returns backup_enabled=true by default", async () => {
      const res = await GET();
      const data = await res.json();
      expect(data.backup_enabled).toBe(true);
    });

    it("returns backup_enabled=false when stored as false", async () => {
      setSetting(db, "backup_enabled", "false");
      const res = await GET();
      const data = await res.json();
      expect(data.backup_enabled).toBe(false);
    });

    it("returns tv_hide_unrated=true by default", async () => {
      const res = await GET();
      const data = await res.json();
      expect(data.tv_hide_unrated).toBe(true);
    });

    it("returns tv_hide_unrated=false when stored as false", async () => {
      setSetting(db, "tv_hide_unrated", "false");
      const res = await GET();
      const data = await res.json();
      expect(data.tv_hide_unrated).toBe(false);
    });
  });

  // ── GET /api/settings — EPG defaults ─────────────────────────────────────

  describe("GET /api/settings — EPG fields", () => {
    it("returns EPG defaults when no settings are stored", async () => {
      const res = await GET();
      const data = await res.json();
      expect(data.epg_url).toBe("");
      expect(data.epg_enabled).toBe(true);
      expect(data.epg_refresh_interval_hours).toBe(0);
      expect(data.epg_last_refresh).toBeNull();
      expect(data.epg_status).toBe("idle");
    });

    it("returns stored EPG settings with correct types", async () => {
      setSetting(db, "epg_url", "https://example.com/epg.xml.gz");
      setSetting(db, "epg_enabled", "false");
      setSetting(db, "epg_refresh_interval_hours", "24");
      setSetting(db, "epg_last_refresh", "2026-04-20T12:00:00.000Z");
      setSetting(db, "epg_status", "running");

      const res = await GET();
      const data = await res.json();
      expect(data.epg_url).toBe("https://example.com/epg.xml.gz");
      expect(data.epg_enabled).toBe(false);
      expect(data.epg_refresh_interval_hours).toBe(24);
      expect(data.epg_last_refresh).toBe("2026-04-20T12:00:00.000Z");
      expect(data.epg_status).toBe("running");
    });
  });
});
