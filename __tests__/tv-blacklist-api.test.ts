// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getSetting, setSetting } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET, PUT } from "@/app/api/tv/blacklist/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-tv-blacklist.db");

describe("TV blacklist API", () => {
  let db: Database.Database | undefined;

  function currentDb(): Database.Database {
    if (!db) throw new Error("test database was not initialized");
    return db;
  }

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db?.close();
    db = undefined;
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  describe("GET /api/tv/blacklist", () => {
    it("returns empty array when no blacklist is set", async () => {
      const res = await GET();
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns the stored blacklist", async () => {
      setSetting(currentDb(), "tv_channel_blacklist", JSON.stringify(["ch1", "ch2", "ch3"]));
      const res = await GET();
      const data = await res.json();
      expect(data).toEqual(["ch1", "ch2", "ch3"]);
    });

    it("returns array with single entry", async () => {
      setSetting(currentDb(), "tv_channel_blacklist", JSON.stringify(["rtl2.de"]));
      const res = await GET();
      const data = await res.json();
      expect(data).toEqual(["rtl2.de"]);
    });
  });

  describe("PUT /api/tv/blacklist", () => {
    function makeRequest(body: string[]) {
      return new Request("http://localhost/api/tv/blacklist", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });
    }

    it("returns ok:true on success", async () => {
      const res = await PUT(makeRequest(["ch1"]));
      const data = await res.json();
      expect(data).toEqual({ ok: true });
    });

    it("saves a list of channel IDs to DB", async () => {
      await PUT(makeRequest(["tvn7", "polsat"]));
      const stored = getSetting(currentDb(), "tv_channel_blacklist");
      expect(JSON.parse(stored!)).toEqual(["tvn7", "polsat"]);
    });

    it("saves an empty array (clear blacklist)", async () => {
      setSetting(currentDb(), "tv_channel_blacklist", JSON.stringify(["tvn7"]));
      await PUT(makeRequest([]));
      const stored = getSetting(currentDb(), "tv_channel_blacklist");
      expect(JSON.parse(stored!)).toEqual([]);
    });

    it("replaces existing blacklist entirely", async () => {
      setSetting(currentDb(), "tv_channel_blacklist", JSON.stringify(["old1", "old2"]));
      await PUT(makeRequest(["new1"]));
      const stored = getSetting(currentDb(), "tv_channel_blacklist");
      expect(JSON.parse(stored!)).toEqual(["new1"]);
    });

    it("round-trips: PUT then GET returns same list", async () => {
      const ids = ["ch.pl.tvn7", "ch.pl.polsat", "ch.pl.tve"];
      await PUT(makeRequest(ids));
      const res = await GET();
      const data = await res.json();
      expect(data).toEqual(ids);
    });

    it("returns 400 when body is not an array", async () => {
      const req = new Request("http://localhost/api/tv/blacklist", {
        method: "PUT",
        body: JSON.stringify({ channels: ["ch1"] }),
        headers: { "content-type": "application/json" },
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/array/i);
    });

    it("returns 400 when body contains non-string items", async () => {
      const req = new Request("http://localhost/api/tv/blacklist", {
        method: "PUT",
        body: JSON.stringify(["valid", 123, null]),
        headers: { "content-type": "application/json" },
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/string/i);
    });
  });
});
