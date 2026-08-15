// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, getSetting, setSetting } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/lib/epg-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/epg-fetch")>();
  return {
    ...actual,
    getMemCache: vi.fn(),
    fetchAndCacheEpg: vi.fn(),
    invalidateMemCache: vi.fn(),
  };
});

vi.mock("@/lib/epg-scheduler", () => ({
  runEpgRefreshNow: vi.fn(),
  rescheduleEpgJob: vi.fn(),
  initEpgScheduler: vi.fn(),
}));

import { GET } from "@/app/api/tv/route";
import { POST as REFRESH } from "@/app/api/tv/refresh/route";
import { getDb } from "@/lib/db";
import { getMemCache, fetchAndCacheEpg, invalidateMemCache } from "@/lib/epg-fetch";
import { runEpgRefreshNow } from "@/lib/epg-scheduler";

const TEST_DB = path.join(__dirname, "test-tv-route.db");

const MOCK_CACHE = {
  channels: [{ id: "tvn7", name: "TVN 7", icon: null }],
  programs: [],
  cachedAt: "2026-04-20T22:00:00.000Z",
  epgUrl: "https://example.com/epg.xml.gz",
};

describe("GET /api/tv", () => {
  let db: Database.Database | undefined;

  function currentDb(): Database.Database {
    if (!db) throw new Error("test database was not initialized");
    return db;
  }

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    setSetting(db, "epg_enabled", "true");
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db?.close();
    db = undefined;
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("returns 403 when EPG is disabled", async () => {
    setSetting(currentDb(), "epg_enabled", "false");
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns cached data with cached:true when mem cache is warm", async () => {
    vi.mocked(getMemCache).mockReturnValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    const data = await res.json();
    expect(data.cached).toBe(true);
    expect(data.channels).toHaveLength(1);
    expect(fetchAndCacheEpg).not.toHaveBeenCalled();
  });

  it("fetches fresh data when mem cache is cold", async () => {
    vi.mocked(getMemCache).mockReturnValue(null);
    vi.mocked(fetchAndCacheEpg).mockResolvedValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    const data = await res.json();
    expect(data.cached).toBe(false);
    expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
  });

  it("invalidates mem cache when bust=1 is passed", async () => {
    vi.mocked(getMemCache).mockReturnValue(null);
    vi.mocked(fetchAndCacheEpg).mockResolvedValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv?bust=1");
    await GET(req);
    expect(invalidateMemCache).toHaveBeenCalledOnce();
  });

  it("does NOT invalidate mem cache without bust param", async () => {
    vi.mocked(getMemCache).mockReturnValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv");
    await GET(req);
    expect(invalidateMemCache).not.toHaveBeenCalled();
  });

  it("returns 502 when fetch fails", async () => {
    vi.mocked(getMemCache).mockReturnValue(null);
    vi.mocked(fetchAndCacheEpg).mockRejectedValue(new Error("timeout"));
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("timeout");
  });

  describe("502 error hint classification", () => {
    async function getErrorFor(err: unknown): Promise<string> {
      vi.mocked(getMemCache).mockReturnValue(null);
      vi.mocked(fetchAndCacheEpg).mockRejectedValue(err);
      const res = await GET(new Request("http://localhost/api/tv"));
      return (await res.json()).error as string;
    }

    it("adds DNS hint when message contains 'fetch failed'", async () => {
      const err = new Error("fetch failed");
      const msg = await getErrorFor(err);
      expect(msg).toContain("unreachable");
    });

    it("adds DNS hint when cause contains ENOTFOUND", async () => {
      const err = Object.assign(new Error("getaddrinfo ENOTFOUND host"), {
        cause: { code: "ENOTFOUND" },
      });
      const msg = await getErrorFor(err);
      expect(msg).toContain("unreachable");
    });

    it("adds DNS hint when cause contains EAI_AGAIN", async () => {
      const err = Object.assign(new Error("getaddrinfo EAI_AGAIN host"), {
        cause: { message: "EAI_AGAIN" },
      });
      const msg = await getErrorFor(err);
      expect(msg).toContain("unreachable");
    });

    it("adds connection refused hint when cause contains ECONNREFUSED", async () => {
      const err = Object.assign(new Error("connect ECONNREFUSED"), {
        cause: { code: "ECONNREFUSED" },
      });
      const msg = await getErrorFor(err);
      expect(msg).toContain("refused the connection");
    });

    it("adds connection refused hint when cause contains ECONNRESET", async () => {
      const err = Object.assign(new Error("read ECONNRESET"), {
        cause: { message: "ECONNRESET" },
      });
      const msg = await getErrorFor(err);
      expect(msg).toContain("refused the connection");
    });

    it("adds TLS hint when message contains 'tls'", async () => {
      const err = new Error("tls handshake failed");
      const msg = await getErrorFor(err);
      expect(msg).toContain("TLS/SSL");
    });

    it("adds TLS hint when message contains 'SSL'", async () => {
      const err = new Error("SSL certificate verify failed");
      const msg = await getErrorFor(err);
      expect(msg).toContain("TLS/SSL");
    });

    it("adds TLS hint when message contains 'packet length'", async () => {
      const err = new Error("wrong packet length");
      const msg = await getErrorFor(err);
      expect(msg).toContain("TLS/SSL");
    });

    it("adds timeout hint when message contains 'timeout'", async () => {
      const err = new Error("The operation timed out (timeout)");
      const msg = await getErrorFor(err);
      expect(msg).toContain("took too long");
    });

    it("adds timeout hint when message contains 'AbortError'", async () => {
      const err = new Error("AbortError: signal timed out");
      const msg = await getErrorFor(err);
      expect(msg).toContain("took too long");
    });

    it("adds HTTP error hint when message contains 'returned 4'", async () => {
      const err = new Error("EPG source returned 404");
      const msg = await getErrorFor(err);
      expect(msg).toContain("URL returned an error");
    });

    it("adds HTTP error hint when message contains 'returned 5'", async () => {
      const err = new Error("EPG source returned 503");
      const msg = await getErrorFor(err);
      expect(msg).toContain("URL returned an error");
    });

    it("uses 'unknown error' and no hint for unrecognised errors", async () => {
      const err = { message: undefined };
      const msg = await getErrorFor(err);
      expect(msg).toBe("Failed to fetch EPG: unknown error.");
    });
  });
});

describe("POST /api/tv/refresh", () => {
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

  it("returns { status: 'started' } and triggers refresh", async () => {
    const res = await REFRESH();
    const data = await res.json();
    expect(data.status).toBe("started");
    expect(runEpgRefreshNow).toHaveBeenCalledOnce();
    expect(invalidateMemCache).toHaveBeenCalledOnce();
  });

  it("returns 409 when refresh is already running", async () => {
    setSetting(currentDb(), "epg_status", "running");
    const res = await REFRESH();
    expect(res.status).toBe(409);
    expect(runEpgRefreshNow).not.toHaveBeenCalled();
  });
});
