import { NextRequest } from "next/server";
import {
  deleteTvEpisodeProgress,
  getDb,
  getTvEpisodeProgress,
  setTvEpisodeWatched,
  type Movie,
} from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

function parsePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isTvMovie(movie: Movie): boolean {
  return movie.type === "tv" || movie.type === "series";
}

function getMovie(db: ReturnType<typeof getDb>, movieId: number): Movie | undefined {
  return db
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(movieId) as Movie | undefined;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const movieId = parsePositiveInt((await params).id);
  if (!movieId) return Response.json({ error: "Invalid movie id" }, { status: 400 });

  try {
    const db = getDb();
    const movie = getMovie(db, movieId);
    if (!movie) return Response.json({ error: "Movie not found" }, { status: 404 });
    if (!isTvMovie(movie)) {
      return Response.json({ error: "Episode progress is only available for TV rows" }, { status: 400 });
    }

    return Response.json({ episodes: getTvEpisodeProgress(db, movieId) });
  } catch (error) {
    console.error("[movies/episodes] GET failed", { movieId, error });
    return Response.json({ error: "Failed to load episode progress" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;

  const movieId = parsePositiveInt((await params).id);
  if (!movieId) return Response.json({ error: "Invalid movie id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const seasonNumber = parsePositiveInt(payload.season_number);
  const episodeNumber = parsePositiveInt(payload.episode_number);
  if (!seasonNumber || !episodeNumber) {
    return Response.json(
      { error: "season_number and episode_number must be positive integers" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const movie = getMovie(db, movieId);
    if (!movie) return Response.json({ error: "Movie not found" }, { status: 404 });
    if (!isTvMovie(movie)) {
      return Response.json({ error: "Episode progress is only available for TV rows" }, { status: 400 });
    }

    const episode = setTvEpisodeWatched(db, movieId, seasonNumber, episodeNumber);
    return Response.json({ episode });
  } catch (error) {
    console.error("[movies/episodes] PUT failed", { movieId, error });
    return Response.json({ error: "Failed to update episode progress" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;

  const movieId = parsePositiveInt((await params).id);
  if (!movieId) return Response.json({ error: "Invalid movie id" }, { status: 400 });

  const seasonNumber = parsePositiveInt(request.nextUrl.searchParams.get("season_number"));
  const episodeNumber = parsePositiveInt(request.nextUrl.searchParams.get("episode_number"));
  if (!seasonNumber || !episodeNumber) {
    return Response.json(
      { error: "season_number and episode_number must be positive integers" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const movie = getMovie(db, movieId);
    if (!movie) return Response.json({ error: "Movie not found" }, { status: 404 });
    if (!isTvMovie(movie)) {
      return Response.json({ error: "Episode progress is only available for TV rows" }, { status: 400 });
    }

    deleteTvEpisodeProgress(db, movieId, seasonNumber, episodeNumber);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[movies/episodes] DELETE failed", {
      movieId,
      seasonNumber,
      episodeNumber,
      error,
    });
    return Response.json({ error: "Failed to clear episode progress" }, { status: 500 });
  }
}
