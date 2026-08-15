"use client";

import { useState, useEffect, useMemo } from "react";
import MovieCard from "./MovieCard";
import EmptyState from "@/components/ui/EmptyState";
import type { Movie } from "@/lib/types";

interface PersonRating {
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

interface PersonViewProps {
  name: string;
  movies: Movie[];
  onBack: () => void;
  onClickMovie: (movie: Movie) => void;
}

export default function PersonView({
  name,
  movies,
  onBack,
  onClickMovie,
}: PersonViewProps) {
  const [ratings, setRatings] = useState<PersonRating[]>([]);

  useEffect(() => {
    fetch(`/api/person-ratings?name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then(setRatings)
      .catch(() => {});
  }, [name]);

  const nameLower = name.toLowerCase();

  const personMovies = useMemo(() => {
    const matched = movies.filter((m) => {
      const inDirector = m.director
        ?.split(",")
        .some((d) => d.trim().toLowerCase() === nameLower);
      const inWriter = m.writer
        ?.split(",")
        .some((w) => w.trim().toLowerCase() === nameLower);
      const inActors = m.actors
        ?.split(",")
        .some((a) => a.trim().toLowerCase() === nameLower);
      return inDirector || inWriter || inActors;
    });

    // Deduplicate by tmdb_id — keep the entry with a user_rating, or the first one
    const seenTmdbIds = new Map<number, Movie>();
    const deduped: Movie[] = [];
    for (const m of matched) {
      if (m.tmdb_id) {
        const existing = seenTmdbIds.get(m.tmdb_id);
        if (!existing) {
          seenTmdbIds.set(m.tmdb_id, m);
          deduped.push(m);
        } else if (m.user_rating != null && existing.user_rating == null) {
          // Replace with the rated version
          const idx = deduped.indexOf(existing);
          deduped[idx] = m;
          seenTmdbIds.set(m.tmdb_id, m);
        }
      } else {
        deduped.push(m);
      }
    }

    return deduped.sort(
      (a, b) =>
        (b.user_rating ?? 0) - (a.user_rating ?? 0) ||
        (b.year ?? 0) - (a.year ?? 0),
    );
  }, [movies, nameLower]);

  const roles = useMemo(() => {
    let hasDirector = false;
    let hasWriter = false;
    let hasActor = false;
    const matches = (field: string | null | undefined) =>
      field?.split(",").some((p) => p.trim().toLowerCase() === nameLower) ?? false;
    for (const m of personMovies) {
      if (!hasDirector && matches(m.director)) hasDirector = true;
      if (!hasWriter && matches(m.writer)) hasWriter = true;
      if (!hasActor && matches(m.actors)) hasActor = true;
      if (hasDirector && hasWriter && hasActor) break;
    }
    const r: string[] = [];
    if (hasDirector) r.push("Director");
    if (hasWriter) r.push("Writer");
    if (hasActor) r.push("Actor");
    return r;
  }, [personMovies, nameLower]);

  const ratedMovies = personMovies.filter(
    (m) => m.user_rating != null && m.user_rating > 0,
  );
  const avgRating =
    ratedMovies.length > 0
      ? Math.round(
          (ratedMovies.reduce((sum, m) => sum + (m.user_rating ?? 0), 0) /
            ratedMovies.length) *
            10,
        ) / 10
      : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-white text-sm font-medium transition-colors mb-4 flex items-center gap-1"
        >
          <span>&#8592;</span> Back to Library
        </button>

        <div className="flex items-center gap-4">
          <h2 className="text-white text-2xl font-bold">{name}</h2>
          {avgRating !== null && (
            <span className="text-indigo-400 font-bold text-lg">
              {avgRating}/10
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2">
          {roles.map((role) => (
            <span
              key={role}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-gray-800 text-gray-400"
            >
              {role}
            </span>
          ))}
          <span className="text-gray-500 text-sm">
            {personMovies.length} movie{personMovies.length !== 1 ? "s" : ""} in
            library
            {ratedMovies.length > 0 && ` \u00b7 ${ratedMovies.length} rated`}
          </span>
        </div>
      </div>

      {/* Movie grid */}
      {personMovies.length === 0 ? (
        <EmptyState
          message={
            <span className="text-sm font-normal text-gray-500">
              No movies found for {name}
            </span>
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {personMovies.map((m) => (
            <MovieCard
              key={m.id}
              title={m.title}
              year={m.year}
              genre={m.genre}
              rating={m.rating}
              userRating={m.user_rating}
              posterUrl={m.poster_url}
              source={m.source}
              cdaUrl={m.cda_url}
              onClick={() => onClickMovie(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
