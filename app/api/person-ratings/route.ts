// tamtam inspected 2026-05-21
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

interface RatedMovieRow {
  id: number;
  title: string;
  year: number | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  user_rating: number;
}

export interface PersonRating {
  name: string;
  role: "director" | "writer" | "actor";
  avg_rating: number;
  movie_count: number;
  movies: {
    id: number;
    title: string;
    year: number | null;
    user_rating: number;
  }[];
}

export function buildPersonMap(
  ratedMovies: RatedMovieRow[],
  filterNames?: Set<string>,
): Map<string, PersonRating> {
  const personMap = new Map<string, PersonRating>();

  const addPerson = (
    personName: string,
    personRole: "director" | "writer" | "actor",
    movie: RatedMovieRow,
  ) => {
    if (filterNames && !filterNames.has(personName.toLowerCase())) return;
    const key = `${personName}::${personRole}`;
    if (!personMap.has(key)) {
      personMap.set(key, {
        name: personName,
        role: personRole,
        avg_rating: 0,
        movie_count: 0,
        movies: [],
      });
    }
    const p = personMap.get(key)!;
    p.movies.push({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      user_rating: movie.user_rating,
    });
    p.movie_count++;
  };

  for (const movie of ratedMovies) {
    if (movie.director) {
      for (const name of movie.director.split(",")) {
        const d = name.trim();
        if (!d) continue;
        addPerson(d, "director", movie);
      }
    }
    if (movie.writer) {
      for (const name of movie.writer.split(",")) {
        const w = name.trim();
        if (!w) continue;
        addPerson(w, "writer", movie);
      }
    }
    if (movie.actors) {
      for (const name of movie.actors.split(",")) {
        const a = name.trim();
        if (!a) continue;
        addPerson(a, "actor", movie);
      }
    }
  }

  for (const p of personMap.values()) {
    p.avg_rating =
      Math.round(
        (p.movies.reduce((sum, m) => sum + m.user_rating, 0) / p.movie_count) *
          10,
      ) / 10;
  }

  return personMap;
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const name = request.nextUrl.searchParams.get("name");
  const names = request.nextUrl.searchParams.getAll("names");

  const ratedMovies = db
    .prepare(
      "SELECT id, title, year, director, writer, actors, user_rating FROM movies WHERE user_rating IS NOT NULL AND user_rating > 0",
    )
    .all() as RatedMovieRow[];

  // Batch or single person lookup
  if (names.length > 0 || name) {
    const filterSet = new Set(
      (names.length > 0 ? names : [name!]).map((n) => n.toLowerCase()),
    );
    const personMap = buildPersonMap(ratedMovies, filterSet);
    return Response.json(Array.from(personMap.values()));
  }

  // Top-rated people
  const limitRaw = parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);
  if (!Number.isFinite(limitRaw) || limitRaw < 1) {
    return Response.json(
      { error: "limit must be a positive integer" },
      { status: 400 },
    );
  }
  const limit = Math.min(limitRaw, 200);
  const role = request.nextUrl.searchParams.get("role") as
    | "director"
    | "writer"
    | "actor"
    | null;

  const personMap = buildPersonMap(ratedMovies);

  const results = Array.from(personMap.values())
    .filter((p) => p.movie_count >= 2 && (!role || p.role === role))
    .sort(
      (a, b) => b.avg_rating - a.avg_rating || b.movie_count - a.movie_count,
    )
    .slice(0, limit);

  return Response.json(results);
}
