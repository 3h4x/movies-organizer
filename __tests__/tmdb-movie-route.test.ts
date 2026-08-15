import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetTmdbMovieSnapshot } = vi.hoisted(() => ({
  mockGetTmdbMovieSnapshot: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  getTmdbMovieSnapshot: mockGetTmdbMovieSnapshot,
}));

import { GET } from "@/app/api/movies/tmdb/[tmdbId]/route";

describe("GET /api/movies/tmdb/[tmdbId]", () => {
  beforeEach(() => {
    mockGetTmdbMovieSnapshot.mockReset();
  });

  it("rejects invalid TMDb IDs", async () => {
    const req = new NextRequest("http://localhost/api/movies/tmdb/nope");
    const res = await GET(req, { params: Promise.resolve({ tmdbId: "nope" }) });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid TMDb ID" });
    expect(mockGetTmdbMovieSnapshot).not.toHaveBeenCalled();
  });

  it("returns a TMDb movie snapshot", async () => {
    mockGetTmdbMovieSnapshot.mockResolvedValue({
      title: "Heat",
      year: 1995,
      genre: "Crime, Drama",
      director: "Michael Mann",
      writer: "Michael Mann",
      actors: "Al Pacino, Robert De Niro",
      rating: 8.3,
      poster_url: "/poster.jpg",
      tmdb_id: 949,
      imdb_id: "tt0113277",
      pl_title: "Goraczka",
      description: "A detail page loaded from TMDb.",
    });

    const req = new NextRequest("http://localhost/api/movies/tmdb/949");
    const res = await GET(req, { params: Promise.resolve({ tmdbId: "949" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      movie: {
        title: "Heat",
        tmdb_id: 949,
        director: "Michael Mann",
      },
    });
    expect(mockGetTmdbMovieSnapshot).toHaveBeenCalledWith(949);
  });

  it("returns 404 when TMDb has no matching movie", async () => {
    mockGetTmdbMovieSnapshot.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/movies/tmdb/99999999");
    const res = await GET(req, {
      params: Promise.resolve({ tmdbId: "99999999" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Movie not found" });
  });
});
