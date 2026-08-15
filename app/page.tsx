"use client";

import { useState, useEffect, useRef } from "react";
import MovieDetail from "@/components/MovieDetail";
import SearchModal from "@/components/SearchModal";
import ImportModal from "@/components/ImportModal";
import SyncModal from "@/components/SyncModal";
import TvTab from "@/components/TvTab";
import PersonView from "@/components/PersonView";
import { ToastContainer } from "@/components/Toast";
import AppNav from "@/components/AppNav";
import LibraryView from "@/components/views/LibraryView";
import RecommendationsView from "@/components/views/RecommendationsView";
import SearchView from "@/components/views/SearchView";
import WishlistView from "@/components/views/WishlistView";
import ConfigView from "@/components/views/ConfigView";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { useRecommendations } from "@/lib/hooks/useRecommendations";
import { useSearch } from "@/lib/hooks/useSearch";
import { getCanonicalMovieForTmdbId } from "@/lib/search";
import { useSettings } from "@/lib/hooks/useSettings";
import type { AppTab, ToastItem, Movie, RecConfig } from "@/lib/types";
import { MOOD_PRESETS, type MoodKey } from "@/lib/mood-presets";
import type { TmdbMovieSnapshot } from "@/lib/tmdb";

const DEFAULT_REC_CONFIG: RecConfig = {
  excluded_genres: [],
  min_year: null,
  min_rating: null,
  max_per_group: 15,
  movie_seed_min_rating: 7,
  movie_seed_count: 10,
  use_tmdb_similar: true,
  actor_min_appearances: 2,
  director_min_films: 2,
};

function parseLocalHashRef(ref: string): number | null {
  if (ref.startsWith("local/")) {
    const idRef = ref.substring(6);
    if (!/^\d+$/.test(idRef)) return null;
    const id = Number.parseInt(idRef, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  return null;
}

function findMovieFromHashRef(movies: Movie[], ref: string): Movie | undefined {
  const localId = parseLocalHashRef(ref);
  if (localId) return movies.find((m) => m.id === localId);

  const tmdbId = parseTmdbHashRef(ref);
  return tmdbId ? getCanonicalMovieForTmdbId(movies, tmdbId) : undefined;
}

function parseTmdbHashRef(ref: string): number | null {
  if (ref.startsWith("local/")) return null;
  if (!/^\d+$/.test(ref)) return null;
  const tmdbId = Number.parseInt(ref, 10);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

export function movieFromTmdbSnapshot(movie: TmdbMovieSnapshot): Movie {
  return {
    id: -movie.tmdb_id,
    title: movie.title,
    year: movie.year,
    genre: movie.genre,
    director: movie.director,
    writer: movie.writer,
    actors: movie.actors,
    rating: movie.rating,
    user_rating: null,
    poster_url: movie.poster_url,
    source: "tmdb",
    type: "movie",
    tmdb_id: movie.tmdb_id,
    rated_at: null,
    created_at: new Date().toISOString(),
    imdb_id: movie.imdb_id,
    pl_title: movie.pl_title,
    description: movie.description,
    wishlist: 0,
  };
}

function decodeHashSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseHashValue(hash: string): {
  tab: AppTab;
  category: string;
  moodKey?: MoodKey;
  invalidMoodKey?: string;
} {
  if (hash === "library") return { tab: "library", category: "all" };
  if (hash === "wishlist" || hash === "watchlist") return { tab: "wishlist", category: "all" };
  if (hash === "config") return { tab: "config", category: "all" };
  if (hash === "tv") return { tab: "tv", category: "all" };
  if (hash.startsWith("search/"))
    return { tab: "search", category: decodeHashSegment(hash.substring(7)) };
  if (hash.startsWith("recommendations")) {
    const parts = hash.split("/");
    if (parts[1] === "mood" && parts[2] && parts[2] in MOOD_PRESETS)
      return { tab: "recommendations", category: "all", moodKey: parts[2] as MoodKey };
    if (parts[1] === "mood") {
      return {
        tab: "recommendations",
        category: "all",
        invalidMoodKey: parts[2] ? decodeHashSegment(parts[2]) : undefined,
      };
    }
    return { tab: "recommendations", category: parts[1] || "all" };
  }
  if (hash.startsWith("person/"))
    return { tab: "person", category: decodeHashSegment(hash.substring(7)) };
  return { tab: "recommendations", category: "all" };
}

function parseHash(): {
  tab: AppTab;
  category: string;
  moodKey?: MoodKey;
  invalidMoodKey?: string;
} {
  if (typeof window === "undefined")
    return { tab: "recommendations", category: "all" };
  return parseHashValue(window.location.hash.replace("#", ""));
}

export function buildHash({
  selectedMovie,
  pendingMovieHash,
  activeTab,
  personFilter,
  searchQuery,
  invalidMoodKey,
  activeMood,
  recCategory,
}: {
  selectedMovie: Movie | null;
  pendingMovieHash: string | null;
  activeTab: AppTab;
  personFilter: string;
  searchQuery: string;
  invalidMoodKey: string | null;
  activeMood: MoodKey | null;
  recCategory: string;
}): string {
  if (selectedMovie) {
    return selectedMovie.tmdb_id
      ? `#movie/${selectedMovie.tmdb_id}`
      : `#movie/local/${selectedMovie.id}`;
  }
  if (pendingMovieHash) return `#movie/${pendingMovieHash}`;
  if (activeTab === "person") return `#person/${encodeURIComponent(personFilter)}`;
  if (activeTab === "search") return `#search/${encodeURIComponent(searchQuery)}`;
  if (activeTab === "library") return "#library";
  if (activeTab === "wishlist") return "#wishlist";
  if (activeTab === "config") return "#config";
  if (activeTab === "tv") return "#tv";
  if (invalidMoodKey) return `#recommendations/mood/${encodeURIComponent(invalidMoodKey)}`;
  if (activeMood) return `#recommendations/mood/${activeMood}`;
  return recCategory === "all" ? "#recommendations" : `#recommendations/${recCategory}`;
}

export function getTabNavigationState({
  currentInvalidMoodKey,
  nextTab,
}: {
  currentInvalidMoodKey: string | null;
  nextTab: AppTab;
}): { nextInvalidMoodKey: string | null; nextTab: AppTab } {
  return {
    nextInvalidMoodKey:
      nextTab === "recommendations" ? null : currentInvalidMoodKey,
    nextTab,
  };
}

export function resolvePendingMovieHash({
  pendingMovieHash,
  initialLoad,
  movies,
}: {
  pendingMovieHash: string | null;
  initialLoad: boolean;
  movies: Movie[];
}): { selectedMovie: Movie | null; nextPendingMovieHash: string | null } {
  if (!pendingMovieHash) {
    return { selectedMovie: null, nextPendingMovieHash: null };
  }
  if (initialLoad) {
    return { selectedMovie: null, nextPendingMovieHash: pendingMovieHash };
  }

  const selectedMovie = findMovieFromHashRef(movies, pendingMovieHash) ?? null;
  return { selectedMovie, nextPendingMovieHash: null };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("recommendations");
  const [personFilter, setPersonFilter] = useState("");
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [invalidMoodKey, setInvalidMoodKey] = useState<string | null>(null);
  const [pendingMovieHash, setPendingMovieHash] = useState<string | null>(null);
  const pendingTmdbLookupRef = useRef<string | null>(null);
  const [disabledEngines, setDisabledEngines] = useState<string[]>([]);
  const [recConfig, setRecConfig] = useState<RecConfig>(DEFAULT_REC_CONFIG);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  function addToast(message: string, variant?: "default" | "success") {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }

  const library = useLibrary(addToast);
  const { movies, setMovies, fetchMovies, initialLoad, searchQuery, setSearchQuery, wishlistMovies } = library;

  const recs = useRecommendations({ movies, disabledEngines, activeTab, addToast, setMovies, setSelectedMovie });

  const settings = useSettings({
    onGroupOrderLoaded: recs.setGroupOrder,
    onConfigLoaded: setRecConfig,
    setDisabledEngines,
  });

  const search = useSearch({ movies, setMovies, selectedMovie, setSelectedMovie, addToast, setSearchOpen });

  function restoreSearchFromHash(query: string) {
    setSearchQuery(query);
    setActiveTab("search");
    void search.handleNavSearch(query);
  }

  function handleTabChange(nextTab: AppTab) {
    const nextState = getTabNavigationState({
      currentInvalidMoodKey: invalidMoodKey,
      nextTab,
    });
    setInvalidMoodKey(nextState.nextInvalidMoodKey);
    setActiveTab(nextState.nextTab);
  }

  useEffect(() => {
    fetchMovies();
    settings.fetchSettings();
    (async () => {
      try {
        const r = await fetch("/api/recommendations/count");
        const d = await r.json();
        recs.setTotalRecsCount(d.total);
      } catch {}
    })();
  }, [fetchMovies, settings.fetchSettings]);

  // Restore tab from URL hash on mount (or queue a movie to open once library loads)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#movie/")) {
      setPendingMovieHash(hash.substring(7));
      return;
    }
    const { tab, category, moodKey, invalidMoodKey } = parseHash();
    if (tab === "search") {
      restoreSearchFromHash(category);
      return;
    }
    if (tab !== "recommendations") setActiveTab(tab);
    if (tab === "person") setPersonFilter(category);
    else if (tab === "recommendations") {
      setInvalidMoodKey(invalidMoodKey ?? null);
      if (moodKey) recs.setActiveMood(moodKey);
      else {
        recs.setActiveMood(null);
        recs.setRecCategory(category);
      }
    }
  }, []);

  // After movies load, open movie referenced in URL (e.g. shared link)
  useEffect(() => {
    if (!pendingMovieHash || initialLoad) return;

    const selectedMovie = findMovieFromHashRef(movies, pendingMovieHash);
    if (selectedMovie) {
      pendingTmdbLookupRef.current = null;
      setSelectedMovie(selectedMovie);
      setPendingMovieHash(null);
      return;
    }

    const tmdbId = parseTmdbHashRef(pendingMovieHash);
    if (!tmdbId) {
      pendingTmdbLookupRef.current = null;
      setPendingMovieHash(null);
      return;
    }
    if (pendingTmdbLookupRef.current === pendingMovieHash) return;

    pendingTmdbLookupRef.current = pendingMovieHash;
    fetch(`/api/movies/tmdb/${tmdbId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`TMDb deep link failed (${response.status})`);
        }
        return (await response.json()) as { movie: TmdbMovieSnapshot };
      })
      .then(({ movie }) => {
        if (window.location.hash !== `#movie/${pendingMovieHash}`) return;
        setSelectedMovie(movieFromTmdbSnapshot(movie));
      })
      .catch(() => {
        if (window.location.hash === `#movie/${pendingMovieHash}`) {
          addToast("Movie link could not be loaded");
        }
      })
      .finally(() => {
        if (pendingTmdbLookupRef.current === pendingMovieHash) {
          pendingTmdbLookupRef.current = null;
        }
        if (window.location.hash === `#movie/${pendingMovieHash}`) {
          setPendingMovieHash(null);
        }
      });
  }, [pendingMovieHash, movies, initialLoad]);

  // Sync URL hash with state (movie modal takes precedence over tab hash)
  useEffect(() => {
    const hash = buildHash({
      selectedMovie,
      pendingMovieHash,
      activeTab,
      personFilter,
      searchQuery,
      invalidMoodKey,
      activeMood: recs.activeMood,
      recCategory: recs.recCategory,
    });
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [selectedMovie, pendingMovieHash, activeTab, recs.recCategory, recs.activeMood, invalidMoodKey, personFilter, searchQuery]);

  // Browser back/forward / external hash navigation
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash;
      if (hash.startsWith("#movie/")) {
        const ref = hash.substring(7);
        const found = findMovieFromHashRef(movies, ref);
        if (found) {
          setPendingMovieHash(null);
          setSelectedMovie(found);
        } else if (initialLoad || parseTmdbHashRef(ref)) {
          setPendingMovieHash(ref);
          setSelectedMovie(null);
        } else {
          setPendingMovieHash(null);
          setSelectedMovie(null);
        }
        return;
      }
      setPendingMovieHash(null);
      setSelectedMovie(null);
      const { tab, category, moodKey, invalidMoodKey } = parseHash();
      if (tab === "search") {
        restoreSearchFromHash(category);
        return;
      }
      setActiveTab(tab);
      if (tab === "person") setPersonFilter(category);
      else {
        setInvalidMoodKey(tab === "recommendations" ? invalidMoodKey ?? null : null);
        recs.setActiveMood(moodKey ?? null);
        recs.setRecCategory(category);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [movies, initialLoad]);

  useEffect(() => {
    if (activeTab === "search" && !searchQuery.trim()) setActiveTab("library");
  }, [searchQuery, activeTab]);

  useEffect(() => {
    if (activeTab === "library" || activeTab === "search") return;
    if (searchQuery) setSearchQuery("");
  }, [activeTab, searchQuery, setSearchQuery]);

  return (
    <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 flex-1">
      <AppNav
        activeTab={activeTab} setActiveTab={handleTabChange} initialLoad={initialLoad}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        moviesCount={movies.length} wishlistCount={wishlistMovies.length}
        totalRecsCount={recs.totalRecsCount} categoryCounts={recs.categoryCounts}
        epgEnabled={settings.epgEnabled} libraryPath={settings.libraryPath}
        onSync={() => setSyncOpen(true)} onImport={() => setImportOpen(true)}
        onSearchEnter={search.handleNavSearch}
      />

      <div className="mt-6 w-full">
        {activeTab === "search" && (
          <SearchView searchQuery={searchQuery} movies={movies}
            tmdbResults={search.tmdbResults} tmdbLoading={search.tmdbLoading}
            tmdbAdded={search.tmdbAdded} tmdbError={search.tmdbError}
            tmdbSearched={search.tmdbSearched}
            onMovieClick={setSelectedMovie}
            onClear={() => { setSearchQuery(""); setActiveTab("library"); }}
            onGoToConfig={() => { setSearchQuery(""); setActiveTab("config"); }}
            onSearchTmdb={() => search.handleNavSearch(searchQuery, { forceTmdb: true })}
            onAddToLibrary={async (r) => { await search.handleAddMovie(r, false); search.setTmdbAdded((prev) => new Set(prev).add(r.tmdb_id)); }}
            onAddToWatchlist={async (r) => { await search.handleAddMovie(r, true); search.setTmdbAdded((prev) => new Set(prev).add(r.tmdb_id)); }}
          />
        )}
        {activeTab === "library" && (
          <LibraryView library={library} onMovieClick={setSelectedMovie} onImport={() => setImportOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onSearchInTMDb={(q) => { setActiveTab("search"); search.handleNavSearch(q, { forceTmdb: true }); }}
          />
        )}
        {activeTab === "recommendations" && (
          <RecommendationsView
            recs={recs}
            hasMovies={movies.length > 0}
            disabledEngines={disabledEngines}
            invalidMoodKey={invalidMoodKey}
            clearInvalidMood={() => setInvalidMoodKey(null)}
          />
        )}
        {activeTab === "person" && personFilter && (
          <PersonView name={personFilter} movies={movies} onBack={() => setActiveTab("library")} onClickMovie={setSelectedMovie} />
        )}
        {activeTab === "wishlist" && (
          <WishlistView wishlistMovies={wishlistMovies} onMovieClick={setSelectedMovie} onAction={library.handleWishlistAction} />
        )}
        {activeTab === "tv" && <TvTab />}
        {activeTab === "config" && (
          <ConfigView recConfig={recConfig} setRecConfig={setRecConfig}
            tmdbKeySource={settings.tmdbKeySource} disabledEngines={disabledEngines}
            setDisabledEngines={setDisabledEngines} libraryPath={settings.libraryPath}
            setLibraryPath={settings.setLibraryPath} setSyncOpen={setSyncOpen}
            addToast={addToast} fetchEngine={recs.fetchEngine} setRecGroups={recs.setRecGroups}
            onOpenMovie={(id) => {
              const found = movies.find((m) => m.id === id);
              if (found) setSelectedMovie(found);
            }}
          />
        )}
      </div>

      <SearchModal isOpen={searchOpen}
        onClose={() => { setSearchOpen(false); search.setSearchTargetId(null); }}
        onAdd={search.handleAddMovie} initialQuery={searchQuery} targetMovieId={search.searchTargetId} />
      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)}
        onComplete={() => { fetchMovies(); settings.fetchSettings(); addToast("Import complete"); }}
        currentPath={settings.libraryPath} />
      <SyncModal isOpen={syncOpen} onClose={() => setSyncOpen(false)} onComplete={fetchMovies} />

      {selectedMovie && (
        <MovieDetail movie={selectedMovie} onClose={() => setSelectedMovie(null)}
          onUpdate={(updated) => {
            setMovies((prev) => {
              // If auto-link merged the previously-selected duplicate into `updated`, drop the old row
              const filtered = selectedMovie && selectedMovie.id !== updated.id
                ? prev.filter((m) => m.id !== selectedMovie.id)
                : prev;
              const exists = filtered.some((m) => m.id === updated.id);
              return exists ? filtered.map((m) => (m.id === updated.id ? updated : m)) : [updated, ...filtered];
            });
            setSelectedMovie(updated);
          }}
          allMovies={movies}
          onPersonClick={(name) => { setSelectedMovie(null); setPersonFilter(name); setActiveTab("person"); }}
          onSearchTMDb={(query, targetId) => {
            setSelectedMovie(null);
            setSearchQuery(query);
            search.setSearchTargetId(targetId || null);
            setSearchOpen(true);
          }}
          onMerge={async (sourceId, targetId) => {
            if (targetId === -1) { setMovies((prev) => prev.filter((m) => m.id !== sourceId)); setSelectedMovie(null); return; }
            const res = await fetch(`/api/movies/${targetId}`);
            const data = await res.json();
            if (data.movie) {
              setMovies((prev) => {
                const next: Movie[] = [];
                for (const movie of prev) {
                  if (movie.id === sourceId) continue;
                  next.push(movie.id === targetId ? data.movie : movie);
                }
                return next;
              });
              setSelectedMovie(data.movie); addToast("Movies merged successfully");
            } else { setMovies((prev) => prev.filter((m) => m.id !== sourceId)); setSelectedMovie(null); fetchMovies(); }
          }}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </main>
  );
}
