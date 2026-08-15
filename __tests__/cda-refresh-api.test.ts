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

vi.mock("@/lib/cda-scheduler", () => ({
  runCdaRefreshNow: vi.fn(),
}));

import { POST } from "@/app/api/cda-refresh/route";
import { getDb } from "@/lib/db";
import { runCdaRefreshNow } from "@/lib/cda-scheduler";

const TEST_DB = path.join(__dirname, "test-cda-refresh-api.db");

describe("POST /api/cda-refresh", () => {
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

  it("returns { status: 'started' } when idle", async () => {
    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("started");
    expect(runCdaRefreshNow).toHaveBeenCalledWith(db);
  });

  it("returns 409 when cda_refresh_status is running", async () => {
    setSetting(db, "cda_refresh_status", "running");

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBeDefined();
    expect(runCdaRefreshNow).not.toHaveBeenCalled();
  });
});
