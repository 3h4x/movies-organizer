"use client";

import { useEffect, useState } from "react";
import type {
  MovieDetailMovie,
  PersonRating,
} from "@/components/movie-detail/types";

interface PersonRatingResponse {
  name: string;
  avg_rating: number;
  movie_count: number;
}

function splitPeople(value: string | null) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function usePersonRatings(movie: MovieDetailMovie) {
  const [personRatings, setPersonRatings] = useState<
    Record<string, PersonRating>
  >({});

  useEffect(() => {
    setPersonRatings({});

    const uniquePeople = [
      ...new Set([
        ...splitPeople(movie.director),
        ...splitPeople(movie.writer),
        ...splitPeople(movie.actors),
      ]),
    ];

    if (uniquePeople.length === 0) return;

    let isCurrent = true;

    async function loadPersonRatings() {
      const params = new URLSearchParams();
      uniquePeople.forEach((name) => params.append("names", name));

      try {
        const response = await fetch(`/api/person-ratings?${params}`);
        const results = (await response.json()) as PersonRatingResponse[];
        if (!isCurrent) return;

        const ratings: Record<string, PersonRating> = {};
        for (const result of results) {
          if (
            result.movie_count >= 1 &&
            (!ratings[result.name] ||
              result.movie_count > ratings[result.name].movie_count)
          ) {
            ratings[result.name] = {
              avg_rating: result.avg_rating,
              movie_count: result.movie_count,
            };
          }
        }
        setPersonRatings(ratings);
      } catch {
        // Person ratings are supplemental; missing ratings should not interrupt
        // the detail modal.
      }
    }

    loadPersonRatings();

    return () => {
      isCurrent = false;
    };
  }, [movie]);

  return personRatings;
}
