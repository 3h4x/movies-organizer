// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, setSetting } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/lib/epg-scheduler", () => ({
  runEpgRefreshNow: vi.fn(),
}));

vi.mock("@/lib/epg-fetch", () => ({
  invalidateMemCache: vi.fn(),
}));

import { POST } from "@/app/api/tv/refresh/route";
import { getDb } from "@/lib/db";
import { runEpgRefreshNow } from "@/lib/epg-scheduler";
import { invalidateMemCache } from "@/lib/epg-fetch";

const TEST_DB = path.join(__dirname, "test-tv-refresh-api.db");

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

  it("returns { status: 'started' } with 200 when idle", async () => {
    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ status: "started" });
  });

  it("calls invalidateMemCache before runEpgRefreshNow", async () => {
    const order: string[] = [];
    vi.mocked(invalidateMemCache).mockImplementation(() => {
      order.push("invalidate");
    });
    vi.mocked(runEpgRefreshNow).mockImplementation(() => {
      order.push("refresh");
    });

    await POST();

    expect(order).toEqual(["invalidate", "refresh"]);
  });

  it("passes the db instance to runEpgRefreshNow", async () => {
    const testDb = currentDb();
    await POST();
    expect(runEpgRefreshNow).toHaveBeenCalledWith(testDb);
  });

  it("returns 409 when epg_status is 'running'", async () => {
    setSetting(currentDb(), "epg_status", "running");

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBeDefined();
  });

  it("does not call runEpgRefreshNow when already running", async () => {
    setSetting(currentDb(), "epg_status", "running");

    await POST();

    expect(runEpgRefreshNow).not.toHaveBeenCalled();
  });

  it("does not call invalidateMemCache when already running", async () => {
    setSetting(currentDb(), "epg_status", "running");

    await POST();

    expect(invalidateMemCache).not.toHaveBeenCalled();
  });

  it("starts successfully when epg_status is 'idle'", async () => {
    setSetting(currentDb(), "epg_status", "idle");

    const res = await POST();
    expect(res.status).toBe(200);
    expect(runEpgRefreshNow).toHaveBeenCalledOnce();
  });

  it("starts successfully when epg_status is 'error'", async () => {
    setSetting(currentDb(), "epg_status", "error");

    const res = await POST();
    expect(res.status).toBe(200);
    expect(runEpgRefreshNow).toHaveBeenCalledOnce();
  });

  it("starts successfully when epg_status is not set", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(runEpgRefreshNow).toHaveBeenCalledOnce();
  });
});
