// tamtam inspected 2026-05-21
import type { Movie } from "@/lib/types";

export interface SearchMatches {
  libraryMatches: Movie[];
  wishlistMatches: Movie[];
}

export interface TmdbSearchMovieState {
  existingMovie: Movie | undefined;
  existingLabel: "In library" | "In watchlist" | null;
}

function compareCanonicalMovies(a: Movie, b: Movie): number {
  const aWishlist = a.wishlist === 1 ? 1 : 0;
  const bWishlist = b.wishlist === 1 ? 1 : 0;
  if (aWishlist !== bWishlist) return aWishlist - bWishlist;

  const aHasFile = a.file_path ? 1 : 0;
  const bHasFile = b.file_path ? 1 : 0;
  if (aHasFile !== bHasFile) return bHasFile - aHasFile;

  const aHasRating = a.user_rating != null && a.user_rating > 0 ? 1 : 0;
  const bHasRating = b.user_rating != null && b.user_rating > 0 ? 1 : 0;
  if (aHasRating !== bHasRating) return bHasRating - aHasRating;

  const aCreatedAt = Date.parse(a.created_at);
  const bCreatedAt = Date.parse(b.created_at);
  if (Number.isFinite(aCreatedAt) && Number.isFinite(bCreatedAt) && aCreatedAt !== bCreatedAt) {
    return bCreatedAt - aCreatedAt;
  }

  return b.id - a.id;
}

export function getCanonicalMovie(movies: Movie[]): Movie | undefined {
  let best: Movie | undefined;
  for (const movie of movies) {
    if (!best || compareCanonicalMovies(movie, best) < 0) {
      best = movie;
    }
  }
  return best;
}

export function getCanonicalMatchingMovie(
  movies: Movie[],
  matches: (movie: Movie) => boolean,
): Movie | undefined {
  let best: Movie | undefined;
  for (const movie of movies) {
    if (!matches(movie)) continue;
    if (!best || compareCanonicalMovies(movie, best) < 0) {
      best = movie;
    }
  }
  return best;
}

export function buildTmdbMovieIndex(movies: Movie[]): Map<number, Movie[]> {
  const index = new Map<number, Movie[]>();

  for (const movie of movies) {
    if (movie.tmdb_id == null) continue;
    const existing = index.get(movie.tmdb_id);
    if (existing) {
      existing.push(movie);
    } else {
      index.set(movie.tmdb_id, [movie]);
    }
  }

  return index;
}

export function getCanonicalMovieForTmdbId(
  movies: Movie[],
  tmdbId: number,
): Movie | undefined {
  return getTmdbSearchMovieState(buildTmdbMovieIndex(movies), tmdbId).existingMovie;
}

export function getTmdbSearchMovieState(
  movieIndex: Map<number, Movie[]>,
  tmdbId: number,
): TmdbSearchMovieState {
  const matches = movieIndex.get(tmdbId) ?? [];
  if (matches.length === 0) {
    return { existingMovie: undefined, existingLabel: null };
  }

  const existingMovie = getCanonicalMovie(matches);
  const existingLabel = matches.some((movie) => movie.wishlist !== 1)
    ? "In library"
    : "In watchlist";

  return { existingMovie, existingLabel };
}

export function upsertCanonicalTmdbMovie(
  movies: Movie[],
  tmdbId: number,
  insertedMovie: Movie,
  updatedMovie: Partial<Movie>,
): Movie[] {
  const existingMovie = getCanonicalMovieForTmdbId(movies, tmdbId);
  if (!existingMovie) {
    return [insertedMovie, ...movies];
  }

  return movies.map((movie) =>
    movie.id === existingMovie.id ? { ...movie, ...updatedMovie } : movie,
  );
}

export function getSearchMatches(
  movies: Movie[],
  rawQuery: string,
): SearchMatches {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return { libraryMatches: [], wishlistMatches: [] };
  }

  const matchesQuery = (movie: Movie) =>
    movie.title.toLowerCase().includes(query) ||
    movie.pl_title?.toLowerCase().includes(query);

  const libraryMatches = movies.filter(
    (movie) =>
      (movie.source !== "recommendation" ||
        (movie.user_rating != null && movie.user_rating > 0)) &&
      !movie.wishlist &&
      matchesQuery(movie),
  );

  const wishlistMatches = movies.filter(
    (movie) => movie.wishlist === 1 && matchesQuery(movie),
  );

  return { libraryMatches, wishlistMatches };
}

export function shouldAutoSearchTmdb(movies: Movie[], rawQuery: string) {
  const { libraryMatches, wishlistMatches } = getSearchMatches(movies, rawQuery);
  return libraryMatches.length === 0 && wishlistMatches.length === 0;
}
