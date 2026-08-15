"use client";

import { useState, useEffect, useMemo } from "react";
import path from "path";
import ManagementBar from "@/components/movie-detail/ManagementBar";
import ManagementMenu from "@/components/movie-detail/ManagementMenu";
import MovieInfoColumn from "@/components/movie-detail/MovieInfoColumn";
import MovieSidebar from "@/components/movie-detail/MovieSidebar";
import { useMovieFileActions } from "@/components/movie-detail/useMovieFileActions";
import { useMovieDetailMetadata } from "@/components/movie-detail/useMovieDetailMetadata";
import { useMoviePlayback } from "@/components/movie-detail/useMoviePlayback";
import { useMovieRating } from "@/components/movie-detail/useMovieRating";
import { useMovieSubtitles } from "@/components/movie-detail/useMovieSubtitles";
import { usePersonRatings } from "@/components/movie-detail/usePersonRatings";
import type { MovieDetailMovie } from "@/components/movie-detail/types";
import { cleanTitle } from "@/lib/utils";

type Movie = MovieDetailMovie;

interface MovieDetailProps {
  movie: Movie;
  onClose: () => void;
  onUpdate?: (updatedMovie: Movie) => void;
  onMerge?: (sourceId: number, targetId: number) => void;
  onSearchTMDb?: (query: string, targetMovieId?: number) => void;
  onPersonClick?: (name: string) => void;
  allMovies?: Movie[];
}

const UNSAFE_PATH_CHARS = /[\\/:*?"<>|]/g;

export default function MovieDetail({
  movie,
  onClose,
  onUpdate,
  onMerge,
  onSearchTMDb,
  onPersonClick,
  allMovies,
}: MovieDetailProps) {
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isPersistedMovie = movie.id > 0;
  const {
    plTitle,
    setPlTitle,
    description,
    setDescription,
    director,
    writer,
    actors,
    filePath,
    setFilePath,
    movieTitle,
    setMovieTitle,
    posterUrl,
    videoMetadata,
    isLoadingMetadata,
  } = useMovieDetailMetadata({ movie, isPersistedMovie, onUpdate });
  const personRatings = usePersonRatings(movie);
  const {
    isStandardizing,
    isRemoving,
    isDeletingDisk,
    standardizeMsg,
    handleStandardize,
    handleRemoveMissing,
    handleDeleteFull,
    handleDeleteDiskOnly,
  } = useMovieFileActions({
    movie,
    onClose,
    onUpdate,
    onMerge,
    setFilePath,
    setMovieTitle,
  });
  const {
    isPlaying,
    showEmbedded,
    setShowEmbedded,
    activePart,
    setActivePart,
    playError,
    handlePlay,
  } = useMoviePlayback(movie);
  const {
    isRating,
    showRatingPicker,
    setShowRatingPicker,
    userRating,
    handleRate,
  } = useMovieRating({
    movie,
    movieTitle,
    director,
    posterUrl,
    isPersistedMovie,
    onUpdate,
  });
  const {
    hasSubtitles,
    subtitlesList,
    isSubtitleUploading,
    subtitleError,
    isDraggingSub,
    handleSubtitleUpload,
    onDragOverSub,
    onDragLeaveSub,
    onDropSub,
  } = useMovieSubtitles({
    movieId: movie.id,
    filePath,
    isPersistedMovie,
  });

  const extraFiles = useMemo<string[]>(
    () => (movie.extra_files ? JSON.parse(movie.extra_files) : []),
    [movie.extra_files],
  );

  useEffect(() => {
    setIsMergeMode(false);
    setMergeQuery("");
    setIsMenuOpen(false);
  }, [movie]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.library_path) setLibraryRoot(data.library_path);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const handleMerge = async (targetId: number) => {
    if (
      !confirm(
        "Are you sure you want to merge these movies? This one will be deleted and its data moved to the target.",
      )
    )
      return;
    setIsMerging(true);
    try {
      const res = await fetch("/api/movies/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: movie.id, targetId }),
      });
      const data = await res.json();
      if (data.ok) {
        if (onMerge) onMerge(movie.id, targetId);
      } else {
        alert(data.error || "Merge failed");
      }
    } catch (e) {
      console.error(e);
      alert("Merge failed");
    } finally {
      setIsMerging(false);
    }
  };

  const potentialMerges = useMemo(() => {
    const cleanCurrentTitle = cleanTitle(movieTitle).toLowerCase();
    const cleanCurrentPlTitle = plTitle
      ? cleanTitle(plTitle).toLowerCase()
      : "";
    const normalizedMergeQuery = mergeQuery.toLowerCase();

    return (allMovies || [])
      .filter((m) => m.id !== movie.id)
      .map((m) => {
        const cleanMTitle = cleanTitle(m.title).toLowerCase();
        const cleanMPlTitle = m.pl_title
          ? cleanTitle(m.pl_title).toLowerCase()
          : "";

        let score = 0;
        if (mergeQuery) {
          if (m.title.toLowerCase().includes(normalizedMergeQuery))
            score += 10;
          if (m.pl_title?.toLowerCase().includes(normalizedMergeQuery))
            score += 10;
        } else {
          // Auto-match score
          if (cleanMTitle === cleanCurrentTitle) score += 20;
          if (cleanMPlTitle && cleanMPlTitle === cleanCurrentPlTitle)
            score += 20;
          if (cleanMPlTitle && cleanMPlTitle === cleanCurrentTitle) score += 15;
          if (cleanMTitle === cleanCurrentPlTitle) score += 15;
          if (movie.year && m.year === movie.year) score += 5;
        }
        return { movie: m, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.movie)
      .slice(0, 10);
  }, [allMovies, movie.id, movie.year, movieTitle, plTitle, mergeQuery]);

  const hasMatches = useMemo(() => {
    const cleanCurrentTitle = cleanTitle(movieTitle).toLowerCase();
    const cleanCurrentPlTitle = plTitle
      ? cleanTitle(plTitle).toLowerCase()
      : "";

    return (allMovies || []).some((m) => {
      if (m.id === movie.id) return false;

      const cleanMTitle = cleanTitle(m.title).toLowerCase();
      const cleanMPlTitle = m.pl_title
        ? cleanTitle(m.pl_title).toLowerCase()
        : "";

      return (
        cleanMTitle === cleanCurrentTitle ||
        (cleanMPlTitle && cleanMPlTitle === cleanCurrentPlTitle) ||
        (cleanMPlTitle && cleanMPlTitle === cleanCurrentTitle) ||
        cleanMTitle === cleanCurrentPlTitle
      );
    });
  }, [allMovies, movie.id, movieTitle, plTitle]);

  useEffect(() => {
    if ((!plTitle || !description) && movie.tmdb_id) {
      fetch(`/api/pl-title?tmdb_id=${movie.tmdb_id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.pl_title && !plTitle) setPlTitle(d.pl_title);
          if (d.description && !description) setDescription(d.description);
        })
        .catch(() => {});
    }
  }, [movie.tmdb_id, plTitle, description]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const safeTitle = movieTitle.replace(UNSAFE_PATH_CHARS, " ");

  // Standard format: Title [Year]/Title.ext
  const isStandard = Boolean(
    filePath &&
      movie.year &&
      libraryRoot &&
      filePath ===
        path.join(
          libraryRoot,
          `${safeTitle} [${movie.year}]`,
          `${safeTitle}${path.extname(filePath)}`,
        ),
  );

  // Also check for standard format WITHOUT year in folder if movie.year is missing: Title/Title.ext
  const isStandardNoYear = Boolean(
    filePath &&
      !movie.year &&
      libraryRoot &&
      filePath ===
        path.join(
          libraryRoot,
          safeTitle,
          `${safeTitle}${path.extname(filePath)}`,
        ),
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#03050b]"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700/50 rounded-2xl w-[calc(100vw-1rem)] sm:w-full max-w-5xl max-h-[90vh] shadow-2xl relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-detail-title"
      >
        <ManagementBar
          filePath={filePath}
          isPlaying={isPlaying}
          isPersistedMovie={isPersistedMovie}
          isMenuOpen={isMenuOpen}
          onPlay={() => handlePlay("play")}
          onOpenFolder={() => handlePlay("folder")}
          onToggleMenu={() => setIsMenuOpen((open) => !open)}
          onClose={onClose}
        />

        <ManagementMenu
          isOpen={isMenuOpen}
          isPersistedMovie={isPersistedMovie}
          movieTitle={movie.title}
          movieId={movie.id}
          hasMatches={hasMatches}
          isMergeMode={isMergeMode}
          standardizeMsg={standardizeMsg}
          filePath={filePath}
          isRemoving={isRemoving}
          isDeletingDisk={isDeletingDisk}
          onSearchTMDb={onSearchTMDb}
          onCloseMenu={() => setIsMenuOpen(false)}
          onStartMerge={() => setIsMergeMode(true)}
          onRemoveMissing={handleRemoveMissing}
          onDeleteDiskOnly={handleDeleteDiskOnly}
          onDeleteFull={handleDeleteFull}
        />

        <div className="overflow-y-auto flex-1 px-4 sm:px-8 pb-6 pt-3">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <MovieSidebar
              title={movie.title}
              posterUrl={posterUrl}
              filePath={filePath}
              showEmbedded={showEmbedded}
              isPlaying={isPlaying}
              playError={playError}
              director={director}
              writer={writer}
              actors={actors}
              isLoadingMetadata={isLoadingMetadata}
              videoMetadata={videoMetadata}
              personRatings={personRatings}
              onPlay={() => handlePlay("play")}
              onEmbed={() => setShowEmbedded(true)}
              onPersonClick={onPersonClick}
            />

            <MovieInfoColumn
              movie={movie}
              movieTitle={movieTitle}
              plTitle={plTitle}
              description={description}
              posterUrl={posterUrl}
              filePath={filePath}
              extraFiles={extraFiles}
              userRating={userRating}
              isRating={isRating}
              showRatingPicker={showRatingPicker}
              isMergeMode={isMergeMode}
              mergeQuery={mergeQuery}
              potentialMerges={potentialMerges}
              isMerging={isMerging}
              showEmbedded={showEmbedded}
              activePart={activePart}
              subtitlesList={subtitlesList}
              hasSubtitles={hasSubtitles}
              isSubtitleUploading={isSubtitleUploading}
              isDraggingSub={isDraggingSub}
              subtitleError={subtitleError}
              isStandard={isStandard}
              isStandardNoYear={isStandardNoYear}
              isStandardizing={isStandardizing}
              standardizeMsg={standardizeMsg}
              onToggleRatingPicker={() => setShowRatingPicker((v) => !v)}
              onRate={handleRate}
              onMergeQueryChange={setMergeQuery}
              onCancelMerge={() => setIsMergeMode(false)}
              onMerge={handleMerge}
              onSelectPart={setActivePart}
              onCloseEmbedded={() => setShowEmbedded(false)}
              onDragOverSub={onDragOverSub}
              onDragLeaveSub={onDragLeaveSub}
              onDropSub={onDropSub}
              onSubtitleUpload={handleSubtitleUpload}
              onStandardize={handleStandardize}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
