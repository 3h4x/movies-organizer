"use client";

import { useEffect, useState } from "react";
import type { MovieDetailMovie } from "@/components/movie-detail/types";

type PlayAction = "play" | "folder";

interface PlayResponse {
  ok?: boolean;
  error?: string;
}

export function useMoviePlayback(movie: MovieDetailMovie) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEmbedded, setShowEmbedded] = useState(false);
  const [activePart, setActivePart] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    setShowEmbedded(false);
    setActivePart(0);
    setPlayError(null);
  }, [movie]);

  const handlePlay = async (action: PlayAction = "play") => {
    setPlayError(null);
    if (action === "play") setIsPlaying(true);

    try {
      const res = await fetch(`/api/movies/${movie.id}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as PlayResponse;
      if (!data.ok) {
        setPlayError(data.error || `Failed to ${action}`);
      }
    } catch {
      setPlayError(`Network error while trying to ${action}`);
    } finally {
      setIsPlaying(false);
    }
  };

  return {
    isPlaying,
    showEmbedded,
    setShowEmbedded,
    activePart,
    setActivePart,
    playError,
    handlePlay,
  };
}
