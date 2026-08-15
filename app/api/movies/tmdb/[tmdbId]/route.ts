import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getTmdbMovieSnapshot } from "@/lib/tmdb";

const TMDB_ID_RE = /^\d+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tmdbId: string }> },
) {
  const limited = rateLimit(request, "tmdb");
  if (limited) return limited;

  const { tmdbId } = await params;
  if (!TMDB_ID_RE.test(tmdbId)) {
    return Response.json({ error: "Invalid TMDb ID" }, { status: 400 });
  }
  const id = Number.parseInt(tmdbId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid TMDb ID" }, { status: 400 });
  }

  try {
    const movie = await getTmdbMovieSnapshot(id);
    if (!movie) {
      return Response.json({ error: "Movie not found" }, { status: 404 });
    }
    return Response.json({ movie });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load TMDb movie";
    if (message.includes("TMDB_API_KEY not set") || message.includes("tmdb_api_error")) {
      return Response.json({ error: "no_api_key" }, { status: 503 });
    }
    console.error("[TMDb deep link] Failed to load movie:", error);
    return Response.json({ error: "Failed to load TMDb movie" }, { status: 500 });
  }
}
