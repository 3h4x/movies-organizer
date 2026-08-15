"use client";
// tamtam inspected 2026-05-21
import { useState } from "react";
import {
  getCanonicalMatchingMovie,
  shouldAutoSearchTmdb,
  upsertCanonicalTmdbMovie,
} from "@/lib/search";
import type { Movie } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";
import { cleanTitle } from "@/lib/utils";

interface UseSearchParams {
  movies: Movie[];
  setMovies: React.Dispatch<React.SetStateAction<Movie[]>>;
  selectedMovie: Movie | null;
  setSelectedMovie: (movie: Movie | null) => void;
  addToast: (message: string, variant?: "default" | "success") => void;
  setSearchOpen: (open: boolean) => void;
}

export function useSearch({
  movies,
  setMovies,
  selectedMovie,
  setSelectedMovie,
  addToast,
  setSearchOpen,
}: UseSearchParams) {
  const [searchTargetId, setSearchTargetId] = useState<number | null>(null);
  const [tmdbResults, setTmdbResults] = useState<TmdbSearchResult[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbAdded, setTmdbAdded] = useState<Set<number>>(new Set());
  const [tmdbError, setTmdbError] = useState<string | null>(null);
  const [tmdbSearched, setTmdbSearched] = useState(false);

  function findExistingMovieMatch(
    searchResult: TmdbSearchResult,
    options?: { excludeId?: number },
  ): Movie | undefined {
    const cleanSearchTitle = cleanTitle(searchResult.title).toLowerCase();

    return getCanonicalMatchingMovie(
      movies,
      (movie) =>
        movie.id !== options?.excludeId &&
        ((movie.tmdb_id != null && movie.tmdb_id === searchResult.tmdb_id) ||
          (cleanTitle(movie.title).toLowerCase() === cleanSearchTitle &&
            movie.year === searchResult.year)),
    );
  }

  async function updateExistingMovie(
    targetId: number,
    searchResult: TmdbSearchResult,
    options?: { setWishlist?: boolean; successMessage?: string },
  ) {
    const res = await fetch(`/api/movies/${targetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: searchResult.title,
        year: searchResult.year,
        genre: searchResult.genre,
        rating: searchResult.rating,
        poster_url: searchResult.poster_url,
        tmdb_id: searchResult.tmdb_id,
        imdb_id: searchResult.imdb_id,
        source: "tmdb",
        wishlist: options?.setWishlist ? 1 : undefined,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setMovies((prev) =>
        prev.map((movie) => (movie.id === targetId ? { ...movie, ...updated } : movie)),
      );
      addToast(options?.successMessage ?? `Updated metadata for "${searchResult.title}"`);
      if (selectedMovie && selectedMovie.id === targetId) {
        setSelectedMovie({ ...selectedMovie, ...updated });
      }
    } else {
      const error = await res.json();
      if (
        error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        error.error?.includes("UNIQUE constraint failed")
      ) {
        const existing = findExistingMovieMatch(searchResult, {
          excludeId: targetId,
        });

        if (existing) {
          if (
            confirm(
              `"${searchResult.title}" already exists in your library as a separate entry. Do you want to merge these two records?`,
            )
          ) {
            const mergeRes = await fetch("/api/movies/merge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sourceId: targetId,
                targetId: existing.id,
              }),
            });

            if (mergeRes.ok) {
              addToast("Movies merged successfully");
              const refreshedRes = await fetch(
                `/api/movies/${existing.id}`,
              );
              if (refreshedRes.ok) {
                const refreshed = await refreshedRes.json();
                const updatedMovie = refreshed.movie || existing;
                setMovies((prev) =>
                  prev
                    .filter((movie) => movie.id !== targetId)
                    .map((movie) => (movie.id === existing.id ? updatedMovie : movie)),
                );
                setSelectedMovie(updatedMovie);
              } else {
                setMovies((prev) =>
                  prev.filter((movie) => movie.id !== targetId),
                );
                setSelectedMovie(null);
              }
            } else {
              addToast("Failed to merge movies");
            }
          }
        } else {
          addToast(
            `Error updating metadata: ${error.error || "Conflict"}`,
          );
        }
      } else {
        addToast(`Error: ${error.error || "Failed to update metadata"}`);
      }
    }

    setSearchOpen(false);
  }

  async function runTmdbSearch(query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setTmdbLoading(true);
    setTmdbError(null);
    setTmdbSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`);
      if (res.ok) {
        setTmdbResults(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setTmdbError(body.error === "no_api_key" ? "no_api_key" : "error");
      }
    } catch {
      setTmdbError("error");
    } finally {
      setTmdbLoading(false);
    }
  }

  async function handleAddMovie(
    searchResult: TmdbSearchResult,
    isWishlist: boolean,
  ) {
    if (searchTargetId) {
      await updateExistingMovie(searchTargetId, searchResult, {
        setWishlist: isWishlist,
      });
      setSearchTargetId(null);
      return;
    }

    const existing = findExistingMovieMatch(searchResult);

    if (existing && isWishlist) {
      if (existing.wishlist === 1) {
        addToast(`"${searchResult.title}" is already in your watchlist`);
        setSearchOpen(false);
        return;
      }

      await updateExistingMovie(existing.id, searchResult, {
        setWishlist: true,
        successMessage: `Added "${searchResult.title}" to watchlist`,
      });
      return;
    }

    if (existing) {
      if (
        confirm(
          `"${searchResult.title}" is already in your library. Do you want to update its metadata instead?`,
        )
      ) {
        await updateExistingMovie(existing.id, searchResult);
      }
      return;
    }

    const res = await fetch("/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: searchResult.title,
        year: searchResult.year,
        genre: searchResult.genre,
        director: null,
        rating: searchResult.rating,
        poster_url: searchResult.poster_url,
        source: "tmdb",
        imdb_id: searchResult.imdb_id,
        tmdb_id: searchResult.tmdb_id,
        type: "movie",
        wishlist: isWishlist ? 1 : 0,
      }),
    });
    const data = await res.json();
    setSearchOpen(false);

    const fallbackMovie: Movie = {
      id: data.id || Date.now(),
      title: searchResult.title,
      year: searchResult.year,
      genre: searchResult.genre,
      director: null,
      writer: null,
      actors: null,
      rating: searchResult.rating,
      user_rating: null,
      poster_url: searchResult.poster_url,
      source: "tmdb",
      type: "movie",
      tmdb_id: searchResult.tmdb_id,
      rated_at: null,
      created_at: new Date().toISOString(),
      wishlist: isWishlist ? 1 : 0,
    };

    let persistedMovie = fallbackMovie;
    if (typeof data.id === "number") {
      const movieRes = await fetch(`/api/movies/${data.id}`);
      if (movieRes.ok) {
        const movieData = await movieRes.json();
        if (movieData.movie) {
          persistedMovie = movieData.movie;
        }
      }
    }

    setMovies((prev) =>
      upsertCanonicalTmdbMovie(
        prev,
        searchResult.tmdb_id,
        persistedMovie,
        persistedMovie,
      ),
    );
    addToast(
      isWishlist
        ? `Added "${searchResult.title}" to watchlist`
        : `Added "${searchResult.title}" to library`,
    );
  }

  async function handleNavSearch(
    query: string,
    options?: { forceTmdb?: boolean },
  ) {
    setTmdbResults([]);
    setTmdbError(null);
    setTmdbAdded(new Set());
    setTmdbSearched(false);

    if (options?.forceTmdb) {
      await runTmdbSearch(query);
      return;
    }

    if (shouldAutoSearchTmdb(movies, query)) {
      await runTmdbSearch(query);
    }
  }

  return {
    searchTargetId,
    setSearchTargetId,
    tmdbResults,
    setTmdbResults,
    tmdbLoading,
    setTmdbLoading,
    tmdbAdded,
    setTmdbAdded,
    tmdbError,
    setTmdbError,
    tmdbSearched,
    runTmdbSearch,
    handleAddMovie,
    handleNavSearch,
  };
}
