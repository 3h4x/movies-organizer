import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { DELETE, GET, PUT } from "@/app/api/movies/[id]/episodes/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-tv-episode-progress.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function putReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/movies/1/episodes", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function malformedPutReq() {
  return new NextRequest("http://localhost/api/movies/1/episodes", {
    method: "PUT",
    body: "{",
    headers: { "Content-Type": "application/json" },
  });
}

function deleteReq(season: number, episode: number) {
  return new NextRequest(
    `http://localhost/api/movies/1/episodes?season_number=${season}&episode_number=${episode}`,
    { method: "DELETE" },
  );
}

describe("movies/[id]/episodes route", () => {
  let db: Database.Database;
  let tvId: number;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    db.pragma("foreign_keys = ON");
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    tvId = insertMovie(db, {
      title: "Twin Peaks",
      year: 1990,
      genre: "Drama",
      director: null,
      rating: 8.7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 1920,
      type: "tv",
    });
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("marks and lists watched TV episodes", async () => {
    const put = await PUT(
      putReq({ season_number: 1, episode_number: 2 }),
      makeParams(tvId),
    );
    expect(put.status).toBe(200);
    const saved = await put.json();
    expect(saved.episode.season_number).toBe(1);
    expect(saved.episode.episode_number).toBe(2);

    const get = await GET(
      new NextRequest("http://localhost/api/movies/1/episodes"),
      makeParams(tvId),
    );
    const listed = await get.json();
    expect(listed.episodes).toHaveLength(1);
    expect(listed.episodes[0].movie_id).toBe(tvId);
  });

  it("updates an existing watched episode instead of duplicating it", async () => {
    await PUT(putReq({ season_number: 1, episode_number: 1 }), makeParams(tvId));
    await PUT(putReq({ season_number: 1, episode_number: 1 }), makeParams(tvId));

    const row = db
      .prepare("SELECT COUNT(*) AS count FROM tv_episode_progress WHERE movie_id = ?")
      .get(tvId) as { count: number };
    expect(row.count).toBe(1);
  });

  it("clears one watched episode", async () => {
    await PUT(putReq({ season_number: 1, episode_number: 3 }), makeParams(tvId));

    const res = await DELETE(deleteReq(1, 3), makeParams(tvId));
    expect(res.status).toBe(200);
    expect(
      db.prepare("SELECT * FROM tv_episode_progress WHERE movie_id = ?").all(tvId),
    ).toHaveLength(0);
  });

  it("rejects non-TV rows", async () => {
    const res = await PUT(
      putReq({ season_number: 1, episode_number: 1 }),
      makeParams(movieId),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Episode progress is only available for TV rows",
    });
  });

  it("rejects invalid season and episode numbers", async () => {
    const res = await PUT(
      putReq({ season_number: 0, episode_number: 1.5 }),
      makeParams(tvId),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "season_number and episode_number must be positive integers",
    });
  });

  it("rejects malformed JSON bodies", async () => {
    const res = await PUT(malformedPutReq(), makeParams(tvId));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns a JSON 500 when GET episode progress fails unexpectedly", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getDb).mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });

    const res = await GET(
      new NextRequest("http://localhost/api/movies/1/episodes"),
      makeParams(tvId),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to load episode progress" });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[movies/episodes] GET failed",
      expect.objectContaining({ movieId: tvId }),
    );
  });

  it("returns a JSON 500 when DELETE episode progress fails unexpectedly", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getDb).mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });

    const res = await DELETE(deleteReq(1, 3), makeParams(tvId));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to clear episode progress" });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[movies/episodes] DELETE failed",
      expect.objectContaining({
        movieId: tvId,
        seasonNumber: 1,
        episodeNumber: 3,
      }),
    );
  });
});
