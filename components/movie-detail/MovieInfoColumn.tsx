"use client";

import type { DragEvent } from "react";
import EmbeddedPlayer from "@/components/movie-detail/EmbeddedPlayer";
import MergeTargetSelector from "@/components/movie-detail/MergeTargetSelector";
import MovieMetadataBadges from "@/components/movie-detail/MovieMetadataBadges";
import MoviePoster from "@/components/movie-detail/MoviePoster";
import MovieTimestamps from "@/components/movie-detail/MovieTimestamps";
import QuickLinks from "@/components/movie-detail/QuickLinks";
import RatingControls from "@/components/movie-detail/RatingControls";
import StorageSection from "@/components/movie-detail/StorageSection";
import SubtitlesSection from "@/components/movie-detail/SubtitlesSection";
import TvEpisodeProgressSection from "@/components/movie-detail/TvEpisodeProgressSection";
import type {
  MovieDetailMovie,
  StandardizeMessage,
  SubtitleTrack,
} from "@/components/movie-detail/types";
import { parseGenreLabels } from "@/lib/utils";

interface MovieInfoColumnProps {
  movie: MovieDetailMovie;
  movieTitle: string;
  plTitle: string | null;
  description: string | null;
  posterUrl: string | null;
  filePath: string | null;
  extraFiles: string[];
  userRating: number | null;
  isRating: boolean;
  showRatingPicker: boolean;
  isMergeMode: boolean;
  mergeQuery: string;
  potentialMerges: MovieDetailMovie[];
  isMerging: boolean;
  showEmbedded: boolean;
  activePart: number;
  subtitlesList: SubtitleTrack[];
  hasSubtitles: boolean;
  isSubtitleUploading: boolean;
  isDraggingSub: boolean;
  subtitleError: string | null;
  isStandard: boolean;
  isStandardNoYear: boolean;
  isStandardizing: boolean;
  standardizeMsg: StandardizeMessage | null;
  onToggleRatingPicker: () => void;
  onRate: (rating: number) => void;
  onMergeQueryChange: (query: string) => void;
  onCancelMerge: () => void;
  onMerge: (targetId: number) => void;
  onSelectPart: (part: number) => void;
  onCloseEmbedded: () => void;
  onDragOverSub: (event: DragEvent<HTMLLabelElement>) => void;
  onDragLeaveSub: (event: DragEvent<HTMLLabelElement>) => void;
  onDropSub: (event: DragEvent<HTMLLabelElement>) => void;
  onSubtitleUpload: (file: File) => void;
  onStandardize: () => void;
}

function MovieTitleBlock({
  movieTitle,
  plTitle,
}: {
  movieTitle: string;
  plTitle: string | null;
}) {
  return (
    <div className="space-y-2 sm:space-y-1">
      <h2
        id="movie-detail-title"
        className="text-xl leading-tight sm:text-3xl lg:text-4xl font-black text-white tracking-tight"
      >
        {movieTitle}
      </h2>
      {plTitle && plTitle !== movieTitle && (
        <p className="text-base leading-snug text-gray-400 font-medium sm:text-xl">
          {plTitle}
        </p>
      )}
    </div>
  );
}

function GenreBadges({ genre }: { genre: string | null }) {
  if (!genre) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
          Genres
        </p>
        <div className="flex flex-wrap gap-2">
          {parseGenreLabels(genre).map((label) => (
            <span
              key={label}
              className="text-xs px-3 py-1 bg-gray-800 text-gray-300 rounded-lg border border-gray-700/50"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlotSummary({ description }: { description: string | null }) {
  if (!description) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
        Plot Summary
      </p>
      <p className="text-gray-300 text-base leading-relaxed font-normal">
        {description}
      </p>
    </div>
  );
}

export default function MovieInfoColumn({
  movie,
  movieTitle,
  plTitle,
  description,
  posterUrl,
  filePath,
  extraFiles,
  userRating,
  isRating,
  showRatingPicker,
  isMergeMode,
  mergeQuery,
  potentialMerges,
  isMerging,
  showEmbedded,
  activePart,
  subtitlesList,
  hasSubtitles,
  isSubtitleUploading,
  isDraggingSub,
  subtitleError,
  isStandard,
  isStandardNoYear,
  isStandardizing,
  standardizeMsg,
  onToggleRatingPicker,
  onRate,
  onMergeQueryChange,
  onCancelMerge,
  onMerge,
  onSelectPart,
  onCloseEmbedded,
  onDragOverSub,
  onDragLeaveSub,
  onDropSub,
  onSubtitleUpload,
  onStandardize,
}: MovieInfoColumnProps) {
  return (
    <div className="order-1 lg:order-2 lg:col-span-8 space-y-6 sm:space-y-8">
      <MovieTitleBlock movieTitle={movieTitle} plTitle={plTitle} />

      <MovieMetadataBadges
        year={movie.year}
        source={movie.source}
        filePath={filePath}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <RatingControls
            globalRating={movie.rating}
            userRating={userRating}
            isRating={isRating}
            showRatingPicker={showRatingPicker}
            onTogglePicker={onToggleRatingPicker}
            onRate={onRate}
          />

          <GenreBadges genre={movie.genre} />

          {(movie.type === "tv" || movie.type === "series") && (
            <TvEpisodeProgressSection movieId={movie.id} />
          )}
        </div>

        <div className="space-y-6">
          {isMergeMode && (
            <MergeTargetSelector
              variant="compact"
              mergeQuery={mergeQuery}
              potentialMerges={potentialMerges}
              isMerging={isMerging}
              onQueryChange={onMergeQueryChange}
              onCancel={onCancelMerge}
              onMerge={onMerge}
            />
          )}

          <QuickLinks
            title={movie.title}
            year={movie.year}
            tmdbId={movie.tmdb_id}
            filmwebUrl={movie.filmweb_url}
            cdaUrl={movie.cda_url}
            plTitle={plTitle}
          />
        </div>
      </div>

      <MoviePoster title={movie.title} posterUrl={posterUrl} size="mobile" />

      {showEmbedded && filePath ? (
        <EmbeddedPlayer
          movieId={movie.id}
          posterUrl={posterUrl}
          filePath={filePath}
          extraFiles={extraFiles}
          activePart={activePart}
          subtitlesList={subtitlesList}
          onSelectPart={onSelectPart}
          onClose={onCloseEmbedded}
        />
      ) : (
        <PlotSummary description={description} />
      )}

      {isMergeMode && (
        <MergeTargetSelector
          variant="full"
          mergeQuery={mergeQuery}
          potentialMerges={potentialMerges}
          isMerging={isMerging}
          onQueryChange={onMergeQueryChange}
          onCancel={onCancelMerge}
          onMerge={onMerge}
        />
      )}

      <SubtitlesSection
        movieTitle={movie.title}
        filePath={filePath}
        hasSubtitles={hasSubtitles}
        subtitlesList={subtitlesList}
        isSubtitleUploading={isSubtitleUploading}
        isDraggingSub={isDraggingSub}
        subtitleError={subtitleError}
        onDragOver={onDragOverSub}
        onDragLeave={onDragLeaveSub}
        onDrop={onDropSub}
        onSubtitleUpload={onSubtitleUpload}
      />

      {filePath && (
        <StorageSection
          filePath={filePath}
          extraFiles={extraFiles}
          isStandard={isStandard}
          isStandardNoYear={isStandardNoYear}
          isStandardizing={isStandardizing}
          standardizeMsg={standardizeMsg}
          onStandardize={onStandardize}
        />
      )}

      <MovieTimestamps createdAt={movie.created_at} ratedAt={movie.rated_at} />
    </div>
  );
}
