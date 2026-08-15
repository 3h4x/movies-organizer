"use client";

import { useEffect, useState, type DragEvent } from "react";
import type { SubtitleTrack } from "@/components/movie-detail/types";
import { getErrorMessage } from "@/lib/utils";

interface SubtitlesResponse {
  hasSubtitles: boolean;
  subtitles?: SubtitleTrack[];
}

interface SubtitleUploadResponse {
  ok?: boolean;
  fileName?: string;
  path?: string;
  error?: string;
}

export function getSubtitleContextKey({
  movieId,
  filePath,
  isPersistedMovie,
}: {
  movieId: number;
  filePath: string | null;
  isPersistedMovie: boolean;
}) {
  return `${movieId}:${isPersistedMovie ? "persisted" : "transient"}:${filePath ?? ""}`;
}

export function useMovieSubtitles({
  movieId,
  filePath,
  isPersistedMovie,
}: {
  movieId: number;
  filePath: string | null;
  isPersistedMovie: boolean;
}) {
  const [hasSubtitles, setHasSubtitles] = useState<boolean>(false);
  const [subtitlesList, setSubtitlesList] = useState<SubtitleTrack[]>([]);
  const [isSubtitleUploading, setIsSubtitleUploading] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const subtitleContextKey = getSubtitleContextKey({
    movieId,
    filePath,
    isPersistedMovie,
  });

  useEffect(() => {
    setSubtitleError(null);
  }, [subtitleContextKey]);

  useEffect(() => {
    if (!isPersistedMovie || !filePath) {
      setHasSubtitles(false);
      setSubtitlesList([]);
      return;
    }

    let isCurrent = true;

    async function loadSubtitles() {
      try {
        const response = await fetch(`/api/movies/${movieId}/subtitles`);
        const data = (await response.json()) as SubtitlesResponse;
        if (!isCurrent) return;

        setHasSubtitles(data.hasSubtitles);
        setSubtitlesList(data.subtitles || []);
      } catch (error) {
        console.error(error);
      }
    }

    loadSubtitles();

    return () => {
      isCurrent = false;
    };
  }, [movieId, filePath, isPersistedMovie]);

  const handleSubtitleUpload = async (file: File) => {
    console.log(
      `[Subtitles] Starting upload: ${file.name} (${file.size} bytes)`,
    );
    setIsSubtitleUploading(true);
    setSubtitleError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log(`[Subtitles] POST /api/movies/${movieId}/subtitles`);
      const response = await fetch(`/api/movies/${movieId}/subtitles`, {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      console.log("[Subtitles] Response received:", text.slice(0, 100));

      let data: SubtitleUploadResponse;
      try {
        data = JSON.parse(text) as SubtitleUploadResponse;
      } catch {
        console.error("[Subtitles] Failed to parse JSON:", text);
        throw new Error("Invalid server response");
      }

      if (data.ok && data.fileName && data.path) {
        const uploadedSubtitle = { name: data.fileName, path: data.path };
        console.log(`[Subtitles] Upload successful: ${uploadedSubtitle.name}`);
        setHasSubtitles(true);
        setSubtitlesList((prev) => [...prev, uploadedSubtitle]);
      } else {
        console.warn(`[Subtitles] Upload failed: ${data.error}`);
        setSubtitleError(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("[Subtitles] Network error:", error);
      setSubtitleError(
        `Network error: ${getErrorMessage(error) || "Check console"}`,
      );
    } finally {
      setIsSubtitleUploading(false);
    }
  };

  const onDragOverSub = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingSub(true);
  };

  const onDragLeaveSub = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingSub(false);
  };

  const onDropSub = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingSub(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      console.log(`[Subtitles] File dropped: ${file.name}`);
      handleSubtitleUpload(file);
    }
  };

  return {
    hasSubtitles,
    subtitlesList,
    isSubtitleUploading,
    subtitleError,
    isDraggingSub,
    handleSubtitleUpload,
    onDragOverSub,
    onDragLeaveSub,
    onDropSub,
  };
}
