"use client";
// tamtam inspected 2026-05-21
import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import MovieCard from "@/components/MovieCard";
import QuickRateMode from "@/components/QuickRateMode";
import SortFilterBar from "@/components/SortFilterBar";
import type { Movie } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/types";
import type { useLibrary } from "@/lib/hooks/useLibrary";
import { isUnratedMovie } from "@/lib/quick-rate";

const MOVIE_GRID_CLASS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5";

type LibraryState = ReturnType<typeof useLibrary>;

interface LibraryViewProps {
  library: LibraryState;
  onMovieClick: (movie: Movie) => void;
  onImport: () => void;
  onOpenSearch: () => void;
  onSearchInTMDb: (query: string) => void;
}

export default function LibraryView({
  library,
  onMovieClick,
  onImport,
  onOpenSearch,
  onSearchInTMDb,
}: LibraryViewProps) {
  const {
    movies,
    initialLoad,
    sort,
    sortDir,
    genreFilter,
    sourceFilter,
    yearFilter,
    unratedOnly,
    hasFileOnly,
    searchQuery,
    setSearchQuery,
    genres,
    sources,
    years,
    sortedMovies,
    visibleMovies,
    visibleCount,
    setVisibleCount,
    setSortOption,
    toggleSortDir,
    setGenreFilter,
    setSourceFilter,
    setYearFilter,
    setUnratedOnly,
    setHasFileOnly,
    handleDeleteMovie,
    handleMoveToWatchlist,
    handleQuickRate,
    handleToggleWishlist,
  } = library;
  const [quickRateOpen, setQuickRateOpen] = useState(false);

  const unratedMovies = useMemo(
    () => sortedMovies.filter(isUnratedMovie),
    [sortedMovies],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key.toLowerCase() !== "r") return;
      if (unratedMovies.length === 0) return;
      event.preventDefault();
      setQuickRateOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [unratedMovies.length]);

  if (initialLoad) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-10 w-full max-w-xs bg-gray-800/40 rounded-xl" />
        <div className="flex gap-3">
          <div className="h-9 w-full max-w-sm bg-gray-800/30 rounded-xl" />
          <div className="h-9 w-28 bg-gray-800/30 rounded-xl" />
        </div>
        <div className={MOVIE_GRID_CLASS}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden bg-gray-800/40 border border-gray-700/20"
            >
              <div className="aspect-[2/3] bg-gray-700/30" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-24 bg-gray-700/30 rounded" />
                <div className="h-3 w-16 bg-gray-700/20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <EmptyState
        icon="🎬"
        message="Your library is empty"
        subtext="Import a folder or search to start building your collection"
      >
        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={onImport}
            className="min-h-11 rounded-xl px-5 py-2.5 text-sm shadow-lg shadow-indigo-500/20"
          >
            Import Folder
          </Button>
          <button
            onClick={onOpenSearch}
            className="min-h-11 rounded-xl border border-gray-700/50 px-5 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-gray-800/60 hover:text-white"
          >
            Search Manually
          </button>
        </div>
      </EmptyState>
    );
  }

  if (sortedMovies.length === 0 && searchQuery) {
    return (
      <EmptyState
        icon="🔍"
        message={`No results for "${searchQuery}"`}
        subtext="Try searching for it on TMDb to add it to your library or watchlist"
      >
        <Button
          onClick={() => onSearchInTMDb(searchQuery)}
          className="min-h-11 rounded-xl px-5 py-2.5 text-sm shadow-lg shadow-indigo-500/20"
        >
          Search in TMDb
        </Button>
      </EmptyState>
    );
  }

  return (
    <>
      <SortFilterBar
        sort={sort}
        sortDir={sortDir}
        genre={genreFilter}
        genres={genres}
        source={sourceFilter}
        sources={sources}
        year={yearFilter}
        years={years}
        unratedOnly={unratedOnly}
        hasFileOnly={hasFileOnly}
        searchQuery={searchQuery}
        onSortChange={setSortOption}
        onSortDirChange={toggleSortDir}
        onGenreChange={setGenreFilter}
        onSourceChange={setSourceFilter}
        onYearChange={setYearFilter}
        onUnratedChange={setUnratedOnly}
        onHasFileChange={setHasFileOnly}
        onSearchChange={setSearchQuery}
      />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <p className="text-gray-600 text-xs">
          Showing {Math.min(visibleCount, sortedMovies.length)} of{" "}
          {sortedMovies.length}
          {sortedMovies.length !== movies.length && ` (${movies.length} total)`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setQuickRateOpen(true)}
            disabled={unratedMovies.length === 0}
            className="min-h-11 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:border-gray-800/70 disabled:bg-gray-900/60 disabled:text-gray-600"
          >
            Quick Rate ({unratedMovies.length}) · R
          </button>
          {searchQuery && (
            <button
              onClick={() => onSearchInTMDb(searchQuery)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-500/10 hover:text-indigo-300"
            >
              <span>🔍</span>
              Search &ldquo;{searchQuery}&rdquo; in TMDb
            </button>
          )}
        </div>
      </div>
      {sortedMovies.length === 0 ? (
        <EmptyState variant="plain" message="No movies match your filters" />
      ) : (
        <div className={MOVIE_GRID_CLASS}>
          {visibleMovies.map((m) => (
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
              onAddToWatchlist={
                (!m.user_rating || m.user_rating === 0) && m.wishlist !== 1
                  ? () => handleMoveToWatchlist(m.id, m.title)
                  : undefined
              }
              onDelete={() => handleDeleteMovie(m.id, m.title)}
              onClick={() => onMovieClick(m)}
            />
          ))}
        </div>
      )}
      {visibleCount < sortedMovies.length && (
        <div className="text-center mt-8">
          <button
            onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}
            className="min-h-11 rounded-xl border border-gray-700/50 px-6 py-3 text-sm font-medium text-gray-400 transition-all hover:bg-gray-800/60 hover:text-white"
          >
            Load More ({sortedMovies.length - visibleCount} remaining)
          </button>
        </div>
      )}
      {quickRateOpen && (
        <QuickRateMode
          movies={sortedMovies}
          onClose={() => setQuickRateOpen(false)}
          onRate={handleQuickRate}
          onToggleWishlist={handleToggleWishlist}
        />
      )}
    </>
  );
}
