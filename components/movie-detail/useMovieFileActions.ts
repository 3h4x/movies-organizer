"use client";

import { useEffect, useState } from "react";
import type {
  MovieDetailMovie,
  StandardizeMessage,
} from "@/components/movie-detail/types";

interface StandardizeResponse {
  ok?: boolean;
  message?: string;
  newPath?: string;
  newTitle?: string;
  mergedId?: number;
  error?: string;
  code?: string;
}

interface DeleteResponse {
  ok?: boolean;
  error?: string;
}

interface UseMovieFileActionsOptions {
  movie: MovieDetailMovie;
  onClose: () => void;
  onUpdate?: (updatedMovie: MovieDetailMovie) => void;
  onMerge?: (sourceId: number, targetId: number) => void;
  setFilePath: (filePath: string | null) => void;
  setMovieTitle: (movieTitle: string) => void;
}

async function parseStandardizeResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text) as StandardizeResponse;
  } catch {
    throw new Error(`Invalid server response: ${text.slice(0, 100)}`);
  }
}

export function useMovieFileActions({
  movie,
  onClose,
  onUpdate,
  onMerge,
  setFilePath,
  setMovieTitle,
}: UseMovieFileActionsOptions) {
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDeletingDisk, setIsDeletingDisk] = useState(false);
  const [standardizeMsg, setStandardizeMsg] =
    useState<StandardizeMessage | null>(null);

  useEffect(() => {
    setStandardizeMsg(null);
    setIsStandardizing(false);
    setIsRemoving(false);
    setIsDeletingDisk(false);
  }, [movie]);

  const handleStandardize = async () => {
    setIsStandardizing(true);
    setStandardizeMsg(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(`/api/movies/${movie.id}/standardize`, {
        method: "POST",
        signal: controller.signal,
      });

      const data = await parseStandardizeResponse(res);

      if (data.ok) {
        setStandardizeMsg({
          type: "success",
          text: data.message || "Path standardized!",
        });
        setFilePath(data.newPath || null);
        if (data.newTitle) {
          setMovieTitle(data.newTitle);
        }
        if (onUpdate) {
          onUpdate({
            ...movie,
            file_path: data.newPath,
            title: data.newTitle || movie.title,
          });
        }
        if (data.mergedId && onMerge) {
          // If merged during standardization, handle it seamlessly.
          onMerge(movie.id, data.mergedId);
        }
      } else {
        setStandardizeMsg({
          type: "error",
          text: data.error || "Failed to standardize",
          code: data.code,
        });
      }
    } catch (error) {
      console.error("Standardization fetch error:", error);
      setStandardizeMsg({
        type: "error",
        text:
          error instanceof Error && error.name === "AbortError"
            ? "Request timed out"
            : "Network error (check server logs)",
      });
    } finally {
      clearTimeout(timeoutId);
      setIsStandardizing(false);
    }
  };

  const handleRemoveMissing = async () => {
    if (
      !confirm(
        "Are you sure you want to remove this entry? The file is missing or unmounted.",
      )
    )
      return;
    setIsRemoving(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(
        `/api/movies/${movie.id}/standardize?delete_missing=true`,
        {
          method: "POST",
          signal: controller.signal,
        },
      );

      const data = await parseStandardizeResponse(res);

      if (data.ok) {
        onClose();
        if (onMerge) {
          // Removing a missing file record updates the list like a merge removal.
          onMerge(movie.id, -1);
        }
      } else {
        setStandardizeMsg({
          type: "error",
          text: data.error || "Failed to remove",
        });
      }
    } catch (error) {
      console.error("Remove missing fetch error:", error);
      setStandardizeMsg({ type: "error", text: "Network error" });
    } finally {
      clearTimeout(timeoutId);
      setIsRemoving(false);
    }
  };

  const handleDeleteFull = async () => {
    const confirmation = confirm(
      `\u26a0\ufe0f DANGER: Are you sure you want to delete "${movie.title}" from BOTH the database and YOUR DISK?\n\nThis will permanently delete the entire movie folder and all its contents.`,
    );
    if (!confirmation) return;

    setIsDeletingDisk(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}/full`, {
        method: "DELETE",
      });
      const data = (await res.json()) as DeleteResponse;

      if (data.ok) {
        onClose();
        if (onMerge) {
          // Signal removal from list.
          onMerge(movie.id, -1);
        }
      } else {
        alert(data.error || "Failed to delete from disk");
      }
    } catch (error) {
      console.error("Delete full error:", error);
      alert("Network error while deleting");
    } finally {
      setIsDeletingDisk(false);
    }
  };

  const handleDeleteDiskOnly = async () => {
    const confirmation = confirm(
      `Delete "${movie.title}" folder from disk?\n\nYour rating and metadata will be kept in the database.`,
    );
    if (!confirmation) return;

    setIsDeletingDisk(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}/full?disk_only=1`, {
        method: "DELETE",
      });
      const data = (await res.json()) as DeleteResponse;

      if (data.ok) {
        setFilePath(null);
        if (onUpdate) {
          onUpdate({
            ...movie,
            file_path: null,
            extra_files: null,
            video_metadata: null,
          });
        }
      } else {
        alert(data.error || "Failed to delete from disk");
      }
    } catch (error) {
      console.error("Delete disk-only error:", error);
      alert("Network error while deleting");
    } finally {
      setIsDeletingDisk(false);
    }
  };

  return {
    isStandardizing,
    isRemoving,
    isDeletingDisk,
    standardizeMsg,
    handleStandardize,
    handleRemoveMissing,
    handleDeleteFull,
    handleDeleteDiskOnly,
  };
}
