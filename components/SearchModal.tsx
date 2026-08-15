"use client";

import { useState, useEffect, useRef } from "react";
import Modal from "./ui/Modal";
import MovieCard from "./MovieCard";
import Spinner from "./ui/Spinner";
import Button from "./ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import {
  CARD_ACTION_ICON_SIZE_CLASS,
  CARD_ACTION_TOUCH_TARGET_CLASS,
} from "./card-action-styles";

interface SearchResult {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  imdb_id: string | null;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (movie: SearchResult, isWishlist: boolean) => void;
  initialQuery?: string;
  targetMovieId?: number | null;
}

const ADD_ACTION_CLASS = `bg-indigo-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-indigo-500 transition-colors`;
const WATCHLIST_ACTION_CLASS = `bg-blue-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-blue-500 transition-colors`;

export default function SearchModal({
  isOpen,
  onClose,
  onAdd,
  initialQuery = "",
  targetMovieId = null,
}: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [lastInitialQuery, setLastInitialQuery] = useState(initialQuery);
  const searchExecuted = useRef(false);

  async function handleSearch(searchQuery = query) {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setHasSearched(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
    if (!res.ok) {
      setResults([]);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  // Sync initialQuery when modal opens
  if (isOpen && initialQuery !== lastInitialQuery) {
    setQuery(initialQuery);
    setLastInitialQuery(initialQuery);
    setHasSearched(false);
  }

  // Auto-search if initialQuery is provided when modal opens
  useEffect(() => {
    if (isOpen && initialQuery && !searchExecuted.current) {
      handleSearch(initialQuery);
      searchExecuted.current = true;
    }
    if (!isOpen) {
      searchExecuted.current = false;
      setHasSearched(false);
      setResults([]);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") onClose();
  }

  return (
    <Modal
      title={targetMovieId ? "Relink Metadata" : "Add to Library"}
      labelId="search-modal-title"
      onClose={onClose}
      maxWidth="max-w-2xl"
      zIndex="z-[90]"
      panelClassName="max-h-[75vh] overflow-y-auto"
      closeOnBackdrop
    >
        <div className="flex gap-2 mb-5">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search movies..."
              className="w-full bg-gray-800/80 text-white px-4 py-2.5 rounded-xl border border-gray-700/50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 focus:outline-none placeholder-gray-600 text-sm"
              autoFocus
            />
          </div>
          <Button
            onClick={() => handleSearch()}
            loading={loading}
            className="px-5 py-2.5 rounded-xl text-sm min-w-[80px]"
          >
            Search
          </Button>
        </div>

        {loading && results.length === 0 && (
          <div className="text-center py-12">
            <Spinner className="mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Searching TMDb...</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {results.map((r) => (
              <div key={r.tmdb_id} className="relative group/search">
                <MovieCard
                  title={r.title}
                  year={r.year}
                  genre={r.genre}
                  rating={r.rating}
                  userRating={null}
                  posterUrl={r.poster_url}
                  source="tmdb"
                  onClick={() => onAdd(r, false)}
                />
                <div className="absolute bottom-14 right-1 flex flex-col gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/search:opacity-100 transition-all duration-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(r, false);
                    }}
                    className={ADD_ACTION_CLASS}
                    aria-label={
                      targetMovieId
                        ? `Update existing movie with ${r.title}`
                        : `Add ${r.title} to library`
                    }
                    title={
                      targetMovieId ? "Update existing movie" : "Add to library"
                    }
                  >
                    {targetMovieId ? "✨" : "➕"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(r, true);
                    }}
                    className={WATCHLIST_ACTION_CLASS}
                    aria-label={`Add ${r.title} to watchlist`}
                    title="Add to watchlist"
                  >
                    🔖
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !loading && hasSearched && query && (
          <EmptyState
            variant="plain"
            message={<>No results for &ldquo;{query}&rdquo;</>}
          />
        )}

        {!hasSearched && !loading && results.length === 0 && (
          <EmptyState
            variant="plain"
            message={
              <span className="text-sm text-gray-600">
                Type a movie name and press Enter
              </span>
            }
          />
        )}
    </Modal>
  );
}
