import { NextRequest } from "next/server";
import { getDb, getMovies, getDetachedMovies, insertMovie, type MovieInput } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const db = getDb();
  if (request.nextUrl.searchParams.get("detached") === "1") {
    return Response.json(getDetachedMovies(db));
  }
  const type = request.nextUrl.searchParams.get("type") || undefined;
  const query = request.nextUrl.searchParams.get("q")?.trim() || undefined;
  const movies = getMovies(db, type, query);
  return Response.json(movies);
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const db = getDb();
  const body = await request.json();

  if (!body.title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  if ("year" in body && body.year !== null) {
    const y = Number(body.year);
    if (!Number.isInteger(y) || y < 1888 || y > 2200) {
      return Response.json(
        { error: "year must be an integer between 1888 and 2200" },
        { status: 400 },
      );
    }
  }
  if ("user_rating" in body && body.user_rating !== null) {
    const r = Number(body.user_rating);
    if (!Number.isFinite(r) || r < 1 || r > 10) {
      return Response.json(
        { error: "user_rating must be null or a number between 1 and 10" },
        { status: 400 },
      );
    }
  }
  if ("wishlist" in body && body.wishlist !== null && body.wishlist !== undefined) {
    if (body.wishlist !== 0 && body.wishlist !== 1) {
      return Response.json(
        { error: "wishlist must be 0 or 1" },
        { status: 400 },
      );
    }
  }

  const movieInput: MovieInput = {
    title: body.title,
    year: body.year ?? null,
    genre: body.genre ?? null,
    director: body.director ?? null,
    rating: body.rating ?? null,
    poster_url: body.poster_url ?? null,
    source: body.source ?? null,
    imdb_id: body.imdb_id ?? null,
    tmdb_id: body.tmdb_id ?? null,
    type: body.type ?? "movie",
    file_path: body.file_path ?? null,
  };

  const id = insertMovie(db, movieInput);

  // Set extra columns if provided (added via migrations, not in base schema)
  try {
    if (body.user_rating != null) {
      db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(
        body.user_rating,
        id,
      );
    }
    if (body.wishlist != null) {
      db.prepare("UPDATE movies SET wishlist = ? WHERE id = ?").run(
        body.wishlist,
        id,
      );
    }
    if (body.cda_url) {
      db.prepare("UPDATE movies SET cda_url = ? WHERE id = ?").run(
        body.cda_url,
        id,
      );
    }
  } catch (e) {
    console.warn("[Movies POST] optional column update failed:", e);
  }

  return Response.json({ id }, { status: 201 });
}
