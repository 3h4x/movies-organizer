import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { refreshMovieTmdbMetadata } from "@/lib/tmdb-refresh";

const ID_RE = /^\d+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const mutationLimited = rateLimit(request, "mutation");
  if (mutationLimited) return mutationLimited;
  const tmdbLimited = rateLimit(request, "tmdb");
  if (tmdbLimited) return tmdbLimited;

  const { id } = await params;
  if (!ID_RE.test(id)) {
    return Response.json({ error: "Invalid movie ID" }, { status: 400 });
  }

  const db = getDb();
  try {
    const result = await refreshMovieTmdbMetadata(db, Number.parseInt(id, 10));
    if (!result) {
      return Response.json({ error: "Movie not found" }, { status: 404 });
    }
    return Response.json(result.movie);
  } catch (error) {
    if (error instanceof Error && error.message === "missing_tmdb_id") {
      return Response.json({ error: "Movie has no TMDb ID" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "unsupported_tmdb_refresh_type") {
      return Response.json({ error: "TMDb refresh is only supported for movies" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "tmdb_movie_not_found") {
      return Response.json({ error: "TMDb movie not found" }, { status: 404 });
    }
    if (
      error instanceof Error &&
      (error.message.includes("TMDB_API_KEY not set") || error.message.includes("tmdb_api_error"))
    ) {
      return Response.json({ error: "TMDb is unavailable" }, { status: 503 });
    }
    console.error("[movies.refresh] Failed to refresh movie metadata", { id, error });
    return Response.json({ error: "Failed to refresh movie metadata" }, { status: 500 });
  }
}
