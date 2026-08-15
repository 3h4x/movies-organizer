"use client";

import { useEffect, useState } from "react";
import type {
  MovieDetailMovie,
  VideoMetadata,
} from "@/components/movie-detail/types";

interface MovieDetailResponse {
  movie?: MovieDetailMovie;
  metadata?: VideoMetadata | { error: string } | null;
}

const pendingMovieDetailRequests = new Map<
  number,
  Promise<MovieDetailResponse>
>();

function fetchMovieDetail(movieId: number): Promise<MovieDetailResponse> {
  const pending = pendingMovieDetailRequests.get(movieId);
  if (pending) return pending;

  const request = fetch(`/api/movies/${movieId}`)
    .then((r) => r.json() as Promise<MovieDetailResponse>)
    .finally(() => {
      pendingMovieDetailRequests.delete(movieId);
    });

  pendingMovieDetailRequests.set(movieId, request);
  return request;
}

interface UseMovieDetailMetadataOptions {
  movie: MovieDetailMovie;
  isPersistedMovie: boolean;
  onUpdate?: (updatedMovie: MovieDetailMovie) => void;
}

export function useMovieDetailMetadata({
  movie,
  isPersistedMovie,
  onUpdate,
}: UseMovieDetailMetadataOptions) {
  const [plTitle, setPlTitle] = useState<string | null>(movie.pl_title || null);
  const [description, setDescription] = useState<string | null>(
    movie.description || null,
  );
  const [director, setDirector] = useState<string | null>(
    movie.director || null,
  );
  const [writer, setWriter] = useState<string | null>(movie.writer || null);
  const [actors, setActors] = useState<string | null>(movie.actors || null);
  const [filePath, setFilePath] = useState<string | null>(
    movie.file_path || null,
  );
  const [movieTitle, setMovieTitle] = useState<string>(movie.title);
  const [posterUrl, setPosterUrl] = useState<string | null>(
    movie.poster_url || null,
  );
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  useEffect(() => {
    setMovieTitle(movie.title);
    setPosterUrl(movie.poster_url || null);
    setFilePath(movie.file_path || null);
    setPlTitle(movie.pl_title || null);
    setDescription(movie.description || null);
    setDirector(movie.director || null);
    setWriter(movie.writer || null);
    setActors(movie.actors || null);
    setVideoMetadata(null);

    if (!isPersistedMovie) {
      setIsLoadingMetadata(false);
      return;
    }

    let isCurrent = true;

    async function loadMovieDetail() {
      setIsLoadingMetadata(true);

      try {
        const data = await fetchMovieDetail(movie.id);
        if (!isCurrent) return;

        if (data.metadata) {
          if (data.metadata.error) {
            setVideoMetadata({ error: data.metadata.error });
          } else {
            setVideoMetadata(data.metadata);
          }
        }

        if (data.movie) {
          // Auto-link may have detected this row was a duplicate of another
          // canonical movie and merged us into it.
          if (data.movie.id !== movie.id && onUpdate) {
            onUpdate(data.movie);
            return;
          }
          if (data.movie.pl_title) setPlTitle(data.movie.pl_title);
          if (data.movie.description) setDescription(data.movie.description);
          if (data.movie.director) setDirector(data.movie.director);
          if (data.movie.writer) setWriter(data.movie.writer);
          if (data.movie.actors) setActors(data.movie.actors);
          if (data.movie.poster_url) setPosterUrl(data.movie.poster_url);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (isCurrent) setIsLoadingMetadata(false);
      }
    }

    loadMovieDetail();

    return () => {
      isCurrent = false;
    };
  }, [movie, isPersistedMovie, onUpdate]);

  return {
    plTitle,
    setPlTitle,
    description,
    setDescription,
    director,
    writer,
    actors,
    filePath,
    setFilePath,
    movieTitle,
    setMovieTitle,
    posterUrl,
    videoMetadata,
    isLoadingMetadata,
  };
}
