import { NextRequest } from "next/server";
import { getMovieLocalized } from "@/lib/tmdb";
import { getDb, updateRecommendedMovie } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "tmdb");
  if (limited) return limited;
  const tmdbId = parseInt(
    request.nextUrl.searchParams.get("tmdb_id") || "",
    10,
  );
  if (!tmdbId) return Response.json({ pl_title: null, description: null });

  const { pl_title, description } = await getMovieLocalized(tmdbId);

  // Save to recommended_movies and movies for future use
  if (pl_title || description) {
    const db = getDb();
    updateRecommendedMovie(db, tmdbId, {
      pl_title: pl_title || undefined,
      description: description || undefined,
    });
    // Also update library movies if they have this tmdb_id
    if (pl_title) {
      try {
        db.prepare(
          "UPDATE movies SET pl_title = ? WHERE tmdb_id = ? AND pl_title IS NULL",
        ).run(pl_title, tmdbId);
      } catch (e) {
        console.warn("[pl-title] pl_title column update failed:", e);
      }
    }
    if (description) {
      try {
        db.prepare(
          "UPDATE movies SET description = ? WHERE tmdb_id = ? AND description IS NULL",
        ).run(description, tmdbId);
      } catch (e) {
        console.warn("[pl-title] description column update failed:", e);
      }
    }
  }

  return Response.json({ pl_title, description });
}
