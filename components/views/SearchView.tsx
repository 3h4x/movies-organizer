"use client";
// tamtam inspected 2026-05-21
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import MovieCard from "@/components/MovieCard";
import Spinner from "@/components/ui/Spinner";
import { buildTmdbMovieIndex, getSearchMatches, getTmdbSearchMovieState } from "@/lib/search";
import type { Movie } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

const RESULTS_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

interface SearchViewProps {
  searchQuery: string;
  movies: Movie[];
  tmdbResults: TmdbSearchResult[];
  tmdbLoading: boolean;
  tmdbAdded: Set<number>;
  tmdbError: string | null;
  tmdbSearched: boolean;
  onMovieClick: (movie: Movie) => void;
  onClear: () => void;
  onGoToConfig: () => void;
  onSearchTmdb: () => Promise<void>;
  onAddToLibrary: (r: TmdbSearchResult) => Promise<void>;
  onAddToWatchlist: (r: TmdbSearchResult) => Promise<void>;
}

export default function SearchView({
  searchQuery,
  movies,
  tmdbResults,
  tmdbLoading,
  tmdbAdded,
  tmdbError,
  tmdbSearched,
  onMovieClick,
  onClear,
  onGoToConfig,
  onSearchTmdb,
  onAddToLibrary,
  onAddToWatchlist,
}: SearchViewProps) {
  const { libraryMatches, wishlistMatches } = getSearchMatches(
    movies,
    searchQuery,
  );
  const movieIndex = buildTmdbMovieIndex(movies);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <p className="text-gray-500 text-sm">
          TMDb results for{" "}
          <span className="text-white">&ldquo;{searchQuery}&rdquo;</span>
        </p>
        <button
          onClick={onClear}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          ✕ Clear
        </button>
      </div>

      {tmdbLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      ) : tmdbError === "no_api_key" ? (
        <EmptyState
          message="TMDb API key not configured"
          subtext="Add your key in the Config tab to enable search"
        >
          <Button
            onClick={onGoToConfig}
            className="px-5 py-2 rounded-lg text-sm"
          >
            Go to Config
          </Button>
        </EmptyState>
      ) : tmdbError === "error" ? (
        <EmptyState
          message="TMDb search failed"
          subtext="Try again in a moment"
        >
          <Button
            onClick={onSearchTmdb}
            className="px-5 py-2 rounded-lg text-sm"
          >
            Search TMDb
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {libraryMatches.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                In your library
              </p>
              <div className={RESULTS_GRID_CLASS}>
                {libraryMatches.map((m) => (
                  <MovieCard
                    key={m.id}
                    title={m.title}
                    year={m.year}
                    genre={m.genre}
                    rating={m.rating}
                    userRating={m.user_rating}
                    posterUrl={m.poster_url}
                    source={m.source}
                    onClick={() => onMovieClick(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {wishlistMatches.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                In your watchlist
              </p>
              <div className={RESULTS_GRID_CLASS}>
                {wishlistMatches.map((m) => (
                  <MovieCard
                    key={m.id}
                    title={m.title}
                    year={m.year}
                    genre={m.genre}
                    rating={m.rating}
                    userRating={m.user_rating}
                    posterUrl={m.poster_url}
                    source={m.source}
                    onClick={() => onMovieClick(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {!tmdbSearched ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Expand Search
                  </p>
                  <p className="mt-2 text-sm text-gray-400">
                    Search TMDb for more matches beyond your library and
                    watchlist.
                  </p>
                </div>
                <Button
                  onClick={onSearchTmdb}
                  className="rounded-xl px-4 py-2 text-sm"
                >
                  Search TMDb
                </Button>
              </div>
            </div>
          ) : tmdbResults.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                From TMDb
              </p>
              <div className={RESULTS_GRID_CLASS}>
                {tmdbResults.map((r) => {
                  const { existingMovie, existingLabel } = getTmdbSearchMovieState(
                    movieIndex,
                    r.tmdb_id,
                  );
                  const justAdded = tmdbAdded.has(r.tmdb_id);
                  return (
                    <div key={r.tmdb_id} className="relative group/card">
                      <MovieCard
                        title={r.title}
                        year={r.year}
                        genre={r.genre}
                        rating={r.rating}
                        userRating={null}
                        posterUrl={r.poster_url}
                        source="tmdb"
                        onClick={existingMovie ? () => onMovieClick(existingMovie) : undefined}
                      />
                      {justAdded || existingLabel ? (
                        <div className="absolute top-1.5 left-1.5 bg-green-600/90 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                          {justAdded ? "Added" : existingLabel}
                        </div>
                      ) : (
                        <div className="absolute bottom-14 right-1 z-10 flex flex-col gap-1 rounded-xl border border-gray-800/70 bg-black/35 p-1 opacity-100 shadow-lg backdrop-blur-sm transition-all duration-200 sm:bottom-14 sm:right-1 sm:border-transparent sm:bg-transparent sm:p-0 sm:opacity-0 sm:shadow-none sm:backdrop-blur-0 sm:group-hover/card:opacity-100">
                          <button
                            onClick={() => onAddToLibrary(r)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/95 text-sm text-white transition-colors hover:bg-indigo-500 sm:h-7 sm:w-7"
                            aria-label={`Add ${r.title} to library`}
                            title="Add to library"
                          >
                            +
                          </button>
                          <button
                            onClick={() => onAddToWatchlist(r)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/95 text-sm text-white transition-colors hover:bg-blue-500 sm:h-7 sm:w-7"
                            aria-label={`Add ${r.title} to watchlist`}
                            title="Add to watchlist"
                          >
                            🔖
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                From TMDb
              </p>
              <EmptyState
                variant="card"
                message={
                  <>
                    No TMDb results for &ldquo;{searchQuery}&rdquo;
                  </>
                }
                subtext="Try a different title or check spelling"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
