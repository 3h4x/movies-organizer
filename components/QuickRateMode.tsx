"use client";
// tamtam inspected 2026-05-21

import { useEffect, useMemo, useState } from "react";
import type { Movie } from "@/lib/types";
import {
  isUnratedMovie,
  mapQuickRateKey,
  nextUnratedMovie,
} from "@/lib/quick-rate";

interface QuickRateModeProps {
  movies: Movie[];
  onClose: () => void;
  onRate: (movie: Movie, rating: number) => Promise<boolean>;
  onToggleWishlist: (movie: Movie) => Promise<boolean>;
  onDismiss?: (movie: Movie) => Promise<boolean>;
}

interface MovieDetailResponse {
  movie?: {
    description?: string | null;
    poster_url?: string | null;
    pl_title?: string | null;
  };
}

export default function QuickRateMode({
  movies,
  onClose,
  onRate,
  onToggleWishlist,
  onDismiss,
}: QuickRateModeProps) {
  const unratedMovies = useMemo(
    () => movies.filter(isUnratedMovie),
    [movies],
  );
  const [currentId, setCurrentId] = useState<number | null>(
    unratedMovies[0]?.id ?? null,
  );
  const [description, setDescription] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [plTitle, setPlTitle] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (unratedMovies.length === 0) {
      onClose();
      return;
    }

    if (!currentId || !unratedMovies.some((movie) => movie.id === currentId)) {
      setCurrentId(unratedMovies[0]?.id ?? null);
    }
  }, [currentId, onClose, unratedMovies]);

  const currentMovie = useMemo(
    () => unratedMovies.find((movie) => movie.id === currentId) ?? null,
    [currentId, unratedMovies],
  );

  const progressIndex = currentMovie
    ? unratedMovies.findIndex((movie) => movie.id === currentMovie.id) + 1
    : 0;

  useEffect(() => {
    if (!currentMovie) {
      setDescription(null);
      setPosterUrl(null);
      setPlTitle(null);
      return;
    }

    setDescription(currentMovie.description ?? null);
    setPosterUrl(currentMovie.poster_url ?? null);
    setPlTitle(currentMovie.pl_title ?? null);

    let cancelled = false;
    void fetch(`/api/movies/${currentMovie.id}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<MovieDetailResponse>;
      })
      .then((data) => {
        if (!data?.movie || cancelled) return;
        setDescription(data.movie.description ?? null);
        setPosterUrl(data.movie.poster_url ?? currentMovie.poster_url ?? null);
        setPlTitle(data.movie.pl_title ?? currentMovie.pl_title ?? null);
      })
      .catch((error) => {
        console.error("[quick-rate] failed to load movie details", error);
      });

    return () => {
      cancelled = true;
    };
  }, [currentMovie]);

  function advance() {
    if (!currentMovie) return;
    const nextMovie = nextUnratedMovie(unratedMovies, currentMovie.id);
    if (nextMovie) {
      setCurrentId(nextMovie.id);
      return;
    }
    onClose();
  }

  useEffect(() => {
    if (!currentMovie) return;

    const movie = currentMovie;

    function onKeyDown(event: KeyboardEvent) {
      if (isBusy || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const action = mapQuickRateKey(event.key);
      if (!action) return;

      event.preventDefault();

      if (action.kind === "exit") {
        onClose();
        return;
      }

      if (action.kind === "skip") {
        advance();
        return;
      }

      if (action.kind === "dismiss") {
        if (!onDismiss) {
          advance();
          return;
        }
        setIsBusy(true);
        void onDismiss(movie)
          .then((ok) => {
            if (ok) advance();
          })
          .finally(() => setIsBusy(false));
        return;
      }

      if (action.kind === "wishlist") {
        setIsBusy(true);
        void onToggleWishlist(movie).finally(() => setIsBusy(false));
        return;
      }

      setIsBusy(true);
      void onRate(movie, action.rating)
        .then((ok) => {
          if (ok) advance();
        })
        .finally(() => setIsBusy(false));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentMovie, isBusy, onClose, onDismiss, onRate, onToggleWishlist, unratedMovies]);

  if (!currentMovie) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_38%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.96))] backdrop-blur-xl">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-300/80">
              Quick Rate
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {progressIndex} / {unratedMovies.length} unrated
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-700/60 bg-gray-900/70 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500/70 hover:text-white"
          >
            Esc to exit
          </button>
        </div>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(260px,360px)_1fr] lg:items-center">
          <div className="overflow-hidden rounded-[28px] border border-gray-800/70 bg-gray-900/70 shadow-2xl shadow-black/40">
            <div className="aspect-[2/3] bg-gray-900">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={currentMovie.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-end bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.26),_transparent_48%),linear-gradient(160deg,_rgba(15,23,42,0.96),_rgba(17,24,39,0.88))] p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
                      No Poster
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-white">
                      {currentMovie.title}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-2">
              {currentMovie.user_rating != null && currentMovie.user_rating > 0 && (
                <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200">
                  Your rating {currentMovie.user_rating}/10
                </span>
              )}
              {currentMovie.wishlist === 1 && (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
                  On watchlist
                </span>
              )}
              {currentMovie.rating != null && currentMovie.rating > 0 && (
                <span className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-200">
                  Global {currentMovie.rating}
                </span>
              )}
            </div>

            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {currentMovie.title}
            </h2>
            {(plTitle || currentMovie.year) && (
              <p className="mt-3 text-lg text-gray-400">
                {[plTitle, currentMovie.year].filter(Boolean).join(" • ")}
              </p>
            )}
            {currentMovie.genre && (
              <p className="mt-2 text-sm uppercase tracking-[0.22em] text-gray-500">
                {currentMovie.genre}
              </p>
            )}

            <p className="mt-6 max-w-3xl text-sm leading-7 text-gray-300 sm:text-base">
              {description?.trim() || "No plot summary available yet."}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-800/70 bg-gray-900/65 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Rate
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  Keys 1-9, 0 = 10
                </p>
              </div>
              <div className="rounded-2xl border border-gray-800/70 bg-gray-900/65 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Skip
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  Press S
                </p>
              </div>
              <div className="rounded-2xl border border-gray-800/70 bg-gray-900/65 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Wishlist
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  Press W
                </p>
              </div>
              <div className="rounded-2xl border border-gray-800/70 bg-gray-900/65 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Dismiss
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  {onDismiss ? "Press D" : "Skips here"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {isBusy && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center">
            <div className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-100">
              Saving…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
