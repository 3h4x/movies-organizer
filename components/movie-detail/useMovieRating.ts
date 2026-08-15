"use client";

import { useEffect, useState } from "react";
import type { MovieDetailMovie } from "@/components/movie-detail/types";

interface UseMovieRatingOptions {
  movie: MovieDetailMovie;
  movieTitle: string;
  director: string | null;
  posterUrl: string | null;
  isPersistedMovie: boolean;
  onUpdate?: (updatedMovie: MovieDetailMovie) => void;
}

export function useMovieRating({
  movie,
  movieTitle,
  director,
  posterUrl,
  isPersistedMovie,
  onUpdate,
}: UseMovieRatingOptions) {
  const [isRating, setIsRating] = useState(false);
  const [showRatingPicker, setShowRatingPicker] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(
    movie.user_rating || null,
  );

  useEffect(() => {
    setIsRating(false);
    setShowRatingPicker(false);
    setUserRating(movie.user_rating || null);
  }, [movie]);

  const handleRate = async (rating: number) => {
    setIsRating(true);
    try {
      if (!isPersistedMovie) {
        const createRes = await fetch("/api/movies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: movieTitle,
            year: movie.year,
            genre: movie.genre,
            director,
            rating: movie.rating,
            poster_url: posterUrl,
            source: movie.source || "tmdb",
            imdb_id: movie.imdb_id ?? null,
            tmdb_id: movie.tmdb_id ?? null,
            type: movie.type || "movie",
            user_rating: rating,
            wishlist: 0,
            cda_url: movie.cda_url || null,
          }),
        });

        if (!createRes.ok) return;
        const { id } = (await createRes.json()) as { id: number };
        const movieRes = await fetch(`/api/movies/${id}`);
        const detail = (await movieRes.json()) as { movie?: MovieDetailMovie };
        const updated = detail.movie ?? { ...movie, id, user_rating: rating };
        setUserRating(rating);
        setShowRatingPicker(false);
        if (onUpdate) onUpdate(updated);
        return;
      }

      const res = await fetch(`/api/movies/${movie.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_rating: rating, wishlist: 0 }),
      });

      if (res.ok) {
        const updated = (await res.json()) as MovieDetailMovie;
        setUserRating(rating);
        setShowRatingPicker(false);
        if (onUpdate) onUpdate(updated);
      }
    } catch (error) {
      console.error("Failed to rate movie:", error);
    } finally {
      setIsRating(false);
    }
  };

  return {
    isRating,
    showRatingPicker,
    setShowRatingPicker,
    userRating,
    handleRate,
  };
}
