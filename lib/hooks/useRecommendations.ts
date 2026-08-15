"use client";
// tamtam inspected 2026-05-21
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { Movie, RecommendationGroup, AppTab, RecType } from "@/lib/types";
import { REC_CATEGORIES } from "@/lib/types";
import type { MoodKey } from "@/lib/mood-presets";
import type { TmdbSearchResult } from "@/lib/tmdb";
import { createLatestOnlyRunner } from "@/lib/latest-only-runner";
import {
  getCanonicalMovieForTmdbId,
  upsertCanonicalTmdbMovie,
} from "@/lib/search";
import {
  getRatedMovieTmdbIds,
  filterRatedRecommendations,
  deduplicateRecommendations,
} from "@/lib/utils";

interface UseRecommendationsParams {
  movies: Movie[];
  disabledEngines: string[];
  activeTab: AppTab;
  addToast: (message: string, variant?: "default" | "success") => void;
  setMovies: React.Dispatch<React.SetStateAction<Movie[]>>;
  setSelectedMovie: (movie: Movie | null) => void;
}

type RecommendationEventType = "open" | "add";

function postRecommendationEvent(
  tmdbId: number,
  event: RecommendationEventType,
  engine?: RecType,
) {
  void fetch("/api/recommendations/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tmdb_id: tmdbId,
      event,
      ...(engine ? { engine } : {}),
    }),
  });
}

export function useRecommendations({
  movies,
  disabledEngines,
  activeTab,
  addToast,
  setMovies,
  setSelectedMovie,
}: UseRecommendationsParams) {
  const [recGroups, setRecGroups] = useState<
    Record<string, RecommendationGroup[]>
  >({});
  const [recLoading, setRecLoading] = useState<Record<string, boolean>>({});
  const [totalRecsCount, setTotalRecsCount] = useState(0);
  const [recCategory, setRecCategory] = useState("all");
  const [activeMood, setActiveMood] = useState<MoodKey | null>(null);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const [moodDropdownOpen, setMoodDropdownOpen] = useState(false);
  const [moodGroups, setMoodGroups] = useState<RecommendationGroup[]>([]);
  const [moodLoading, setMoodLoading] = useState(false);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [lastRecsRefresh, setLastRecsRefresh] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("rec_last_refreshed")
      : null,
  );

  const initialLoadSaved = useRef(false);
  const moodRunnerRef = useRef(createLatestOnlyRunner<RecommendationGroup[]>());

  useEffect(() => {
    if (!activeMood) {
      moodRunnerRef.current.invalidate();
      setMoodGroups([]);
      setMoodLoading(false);
      setMoodError(null);
      return;
    }

    const controller = new AbortController();
    let requestErrorMessage = "Failed to load mood picks";
    void moodRunnerRef.current.run(
      async () => {
        try {
          const response = await fetch(`/api/recommendations/mood?key=${activeMood}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Request failed (${response.status})`);
          return (await response.json()) as RecommendationGroup[];
        } catch (error) {
          requestErrorMessage =
            error instanceof Error ? error.message : "Failed to load mood picks";
          throw error;
        }
      },
      {
        onStart: () => {
          setMoodLoading(true);
          setMoodError(null);
        },
        onSuccess: (data) => setMoodGroups(data),
        onError: () => {
          if (controller.signal.aborted) return;
          setMoodError(requestErrorMessage);
        },
        onSettled: () => setMoodLoading(false),
      },
    );

    return () => {
      controller.abort();
      moodRunnerRef.current.invalidate();
    };
  }, [activeMood]);

  const recommendations = useMemo(() => {
    const ratedTmdbIds = getRatedMovieTmdbIds(movies);
    if (recCategory === "all") {
      return deduplicateRecommendations(
        filterRatedRecommendations(
          Object.values(recGroups).flat(),
          ratedTmdbIds,
        ),
      );
    }
    return filterRatedRecommendations(
      recGroups[recCategory] ?? [],
      ratedTmdbIds,
      recCategory === "random",
    );
  }, [recGroups, recCategory, movies]);

  const categoryCounts = useMemo(() => {
    const ratedTmdbIds = getRatedMovieTmdbIds(movies);
    const counts: Record<string, number> = {};
    const allSeen = new Set<number>();
    for (const [key, groups] of Object.entries(recGroups)) {
      let count = 0;
      for (const g of groups) {
        for (const r of g.recommendations) {
          if (!ratedTmdbIds.has(r.tmdb_id)) {
            count++;
            allSeen.add(r.tmdb_id);
          }
        }
      }
      if (count > 0) counts[key] = count;
    }
    if (allSeen.size > 0) counts["all"] = allSeen.size;
    return counts;
  }, [recGroups, movies]);

  const hasAnyRecs = Object.keys(recGroups).length > 0;
  const recsLoading =
    recCategory === "all"
      ? !hasAnyRecs &&
        (Object.values(recLoading).some(Boolean) ||
          (activeTab === "recommendations" && movies.length > 0))
      : !recGroups[recCategory] &&
        ((recLoading[recCategory] ?? false) ||
          (activeTab === "recommendations" && movies.length > 0));

  const fetchEngine = useCallback(async (engine: string, refresh = false) => {
    setRecLoading((prev) => ({ ...prev, [engine]: true }));
    const url = `/api/recommendations?engine=${engine}${refresh ? "&refresh=true" : ""}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setRecGroups((prev) => ({ ...prev, [engine]: data }));
    } finally {
      setRecLoading((prev) => ({ ...prev, [engine]: false }));
    }
  }, []);

  useEffect(() => {
    if (initialLoadSaved.current) return;
    const enabled = REC_CATEGORIES.slice(1)
      .map((c) => c.value)
      .filter((key) => !disabledEngines.includes(key));
    const allLoaded =
      enabled.length > 0 &&
      enabled.every((key) => recGroups[key] && !recLoading[key]);
    if (allLoaded) {
      initialLoadSaved.current = true;
      saveRefreshTimestamp();
    }
  }, [recGroups, recLoading, disabledEngines]);

  useEffect(() => {
    if (activeTab === "recommendations" && movies.length > 0) {
      if (
        !disabledEngines.includes("cda") &&
        !recGroups["cda"] &&
        !recLoading["cda"]
      ) {
        fetchEngine("cda");
      }
      if (recCategory === "all") {
        const missing = REC_CATEGORIES.slice(1)
          .map((c) => c.value)
          .filter(
            (key) =>
              !disabledEngines.includes(key) &&
              !recGroups[key] &&
              !recLoading[key],
          );
        missing.forEach((key) => fetchEngine(key));
      } else if (
        !disabledEngines.includes(recCategory) &&
        !recGroups[recCategory] &&
        !recLoading[recCategory]
      ) {
        fetchEngine(recCategory);
      }
    }
  }, [
    activeTab,
    recCategory,
    movies.length,
    fetchEngine,
    recGroups,
    recLoading,
    disabledEngines,
  ]);

  function saveRefreshTimestamp() {
    const now = new Date().toISOString();
    setLastRecsRefresh(now);
    localStorage.setItem("rec_last_refreshed", now);
  }

  async function refreshRecs() {
    const engineKeys = REC_CATEGORIES.slice(1)
      .map((c) => c.value)
      .filter((key) => !disabledEngines.includes(key));
    const loadingState = Object.fromEntries(engineKeys.map((k) => [k, true]));
    setRecLoading((prev) => ({ ...prev, ...loadingState }));
    await Promise.all(engineKeys.map((key) => fetchEngine(key, true)));
    saveRefreshTimestamp();
    addToast("Recommendations refreshed", "success");
  }

  function removeFromView(tmdbId: number, title?: string) {
    setRecGroups((prev) => {
      const next: Record<string, RecommendationGroup[]> = {};
      for (const [key, groups] of Object.entries(prev)) {
        next[key] = groups
          .map((g) => ({
            ...g,
            recommendations: g.recommendations.filter(
              (r) => r.tmdb_id !== tmdbId && (!title || r.title !== title),
            ),
          }))
          .filter((g) => g.recommendations.length > 0);
      }
      return next;
    });
    setMoodGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          recommendations: g.recommendations.filter(
            (r) => r.tmdb_id !== tmdbId && (!title || r.title !== title),
          ),
        }))
        .filter((g) => g.recommendations.length > 0),
    );
  }

  async function handleRecAction(
    tmdbId: number,
    action: string,
    rec: TmdbSearchResult,
    fromMood = false,
    engine?: RecType,
  ) {
    const existingMovie = getCanonicalMovieForTmdbId(movies, rec.tmdb_id);

    removeFromView(tmdbId, rec.title);
    if (!fromMood) setTotalRecsCount((c) => Math.max(0, c - 1));

    const actionLabels: Record<string, string> = {
      liked: `Liked "${rec.title}" — added to library`,
      watched: `Marked "${rec.title}" as watched`,
      disliked: `Disliked "${rec.title}" — added to library`,
      dismiss: `Won't show "${rec.title}" again`,
      wishlist: `Added "${rec.title}" to watchlist`,
    };
    addToast(actionLabels[action] || "Done");

    if (action !== "dismiss") {
      const userRating =
        action === "liked"
          ? 8
          : action === "disliked"
            ? 3
            : action === "wishlist"
              ? null
              : 5;
      const isWishlist = action === "wishlist";
      const newMovie: Movie = {
        id: Date.now(),
        title: rec.title,
        year: rec.year,
        genre: rec.genre,
        director: null,
        writer: null,
        actors: null,
        rating: rec.rating,
        user_rating: userRating,
        poster_url: rec.poster_url,
        source: rec.cda_url ? "cda" : "tmdb",
        type: "movie",
        tmdb_id: rec.tmdb_id,
        rated_at: null,
        created_at: new Date().toISOString(),
        wishlist: isWishlist ? 1 : 0,
        cda_url: rec.cda_url || null,
      };
      setMovies((prev) => {
        const optimisticUpdate: Partial<Movie> = {
          title: rec.title,
          year: rec.year,
          genre: rec.genre,
          director: null,
          writer: null,
          actors: null,
          rating: rec.rating,
          user_rating: userRating,
          poster_url: rec.poster_url,
          source: rec.cda_url ? "cda" : "tmdb",
          type: "movie",
          tmdb_id: rec.tmdb_id,
          rated_at: null,
          wishlist: isWishlist ? 1 : 0,
          cda_url: rec.cda_url || null,
        };

        return upsertCanonicalTmdbMovie(
          prev,
          rec.tmdb_id,
          newMovie,
          optimisticUpdate,
        );
      });
      const requestBody = {
        title: rec.title,
        year: rec.year,
        genre: rec.genre,
        director: null,
        rating: rec.rating,
        poster_url: rec.poster_url,
        source: rec.cda_url ? "cda" : "tmdb",
        imdb_id: null,
        tmdb_id: rec.tmdb_id,
        type: "movie",
        user_rating: userRating,
        wishlist: isWishlist ? 1 : 0,
        cda_url: rec.cda_url || null,
      };

      const movieRequest = fetch(
        existingMovie ? `/api/movies/${existingMovie.id}` : "/api/movies",
        {
          method: existingMovie ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );

      void movieRequest.then((response) => {
        if (response.ok) {
          postRecommendationEvent(tmdbId, "add", engine);
        }
      });
    }

    void fetch("/api/recommendations/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdb_id: tmdbId, engine }),
    });
  }

  async function handleRecClick(rec: TmdbSearchResult, engine?: RecType) {
    postRecommendationEvent(rec.tmdb_id, "open", engine);

    const existing = getCanonicalMovieForTmdbId(movies, rec.tmdb_id);
    if (existing) {
      setSelectedMovie(existing);
      return;
    }
    const res = await fetch("/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: rec.title,
        year: rec.year,
        genre: rec.genre,
        rating: rec.rating,
        poster_url: rec.poster_url,
        source: "recommendation",
        tmdb_id: rec.tmdb_id,
        type: "movie",
        cda_url: rec.cda_url || null,
      }),
    });
    if (!res.ok) return;
    postRecommendationEvent(rec.tmdb_id, "add", engine);
    const { id } = await res.json();
    const movieRes = await fetch(`/api/movies/${id}`);
    const { movie } = await movieRes.json();
    setMovies((prev) => {
      const exists = prev.some((m) => m.id === id);
      return exists
        ? prev.map((m) => (m.id === id ? movie : m))
        : [movie, ...prev];
    });
    setSelectedMovie(movie);
  }

  return {
    recGroups,
    setRecGroups,
    recLoading,
    totalRecsCount,
    setTotalRecsCount,
    recCategory,
    setRecCategory,
    activeMood,
    setActiveMood,
    engineDropdownOpen,
    setEngineDropdownOpen,
    moodDropdownOpen,
    setMoodDropdownOpen,
    moodGroups,
    moodLoading,
    moodError,
    groupOrder,
    setGroupOrder,
    lastRecsRefresh,
    recommendations,
    categoryCounts,
    recsLoading,
    fetchEngine,
    refreshRecs,
    removeFromView,
    handleRecAction,
    handleRecClick,
  };
}
