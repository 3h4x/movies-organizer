// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, recordRecommendationEvent } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST } from "@/app/api/recommendations/event/route";
import { POST as dismissPOST } from "@/app/api/recommendations/dismiss/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-rec-events.db");

function req(body: object) {
  return new NextRequest("http://localhost/api/recommendations/event", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function dismissReq(body: object) {
  return new NextRequest("http://localhost/api/recommendations/dismiss", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/recommendations/event", () => {
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

  it("returns 400 when tmdb_id is missing", async () => {
    const res = await POST(req({ event: "open" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 when tmdb_id is not a number", async () => {
    const res = await POST(req({ tmdb_id: "abc", event: "open" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when event is not a valid type", async () => {
    const res = await POST(req({ tmdb_id: 123, event: "view" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/event must be one of/);
  });

  it("returns 400 when event is missing", async () => {
    const res = await POST(req({ tmdb_id: 123 }));
    expect(res.status).toBe(400);
  });

  it("inserts an open event and returns ok:true", async () => {
    const res = await POST(req({ tmdb_id: 42, event: "open" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const row = db
      .prepare("SELECT * FROM recommendation_events WHERE tmdb_id = 42")
      .get() as { tmdb_id: number; engine: string; event: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.event).toBe("open");
    expect(row!.engine).toBe("");
  });

  it("inserts an add event with engine when provided", async () => {
    const res = await POST(req({ tmdb_id: 99, engine: "genre", event: "add" }));
    expect(res.status).toBe(200);

    const row = db
      .prepare("SELECT * FROM recommendation_events WHERE tmdb_id = 99")
      .get() as { tmdb_id: number; engine: string; event: string } | undefined;
    expect(row!.event).toBe("add");
    expect(row!.engine).toBe("genre");
  });

  it("inserts a dismiss event", async () => {
    const res = await POST(req({ tmdb_id: 7, event: "dismiss" }));
    expect(res.status).toBe(200);

    const row = db
      .prepare("SELECT event FROM recommendation_events WHERE tmdb_id = 7")
      .get() as { event: string } | undefined;
    expect(row!.event).toBe("dismiss");
  });

  it("can insert multiple events for the same tmdb_id", async () => {
    await POST(req({ tmdb_id: 55, event: "open" }));
    await POST(req({ tmdb_id: 55, event: "add" }));

    const rows = db
      .prepare("SELECT event FROM recommendation_events WHERE tmdb_id = 55")
      .all() as { event: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.event).sort()).toEqual(["add", "open"]);
  });

  it.each(["liked", "watched", "wishlist", "disliked"])(
    "records add then dismiss events for %s action sequence",
    async () => {
      await POST(req({ tmdb_id: 77, engine: "genre", event: "add" }));
      await dismissPOST(dismissReq({ tmdb_id: 77, engine: "genre" }));

      const rows = db
        .prepare(
          "SELECT engine, event FROM recommendation_events WHERE tmdb_id = 77 ORDER BY id",
        )
        .all() as { engine: string; event: string }[];
      expect(rows).toEqual([
        { engine: "genre", event: "add" },
        { engine: "genre", event: "dismiss" },
      ]);
    },
  );

  it("records a dismiss event when the dismiss route is called directly", async () => {
    await dismissPOST(dismissReq({ tmdb_id: 88, engine: "actor" }));

    const rows = db
      .prepare(
        "SELECT engine, event FROM recommendation_events WHERE tmdb_id = 88 ORDER BY id",
      )
      .all() as { engine: string; event: string }[];
    expect(rows).toEqual([{ engine: "actor", event: "dismiss" }]);
  });
});

describe("recordRecommendationEvent helper", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("inserts a row and increments on subsequent calls", () => {
    recordRecommendationEvent(db, 10, "actor", "open");
    recordRecommendationEvent(db, 10, "actor", "open");

    const rows = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM recommendation_events WHERE tmdb_id = 10",
      )
      .get() as { cnt: number };
    expect(rows.cnt).toBe(2);
  });
});
