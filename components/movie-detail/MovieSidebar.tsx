"use client";

import CreditsSection from "@/components/movie-detail/CreditsSection";
import MoviePoster from "@/components/movie-detail/MoviePoster";
import TechnicalDetails from "@/components/movie-detail/TechnicalDetails";
import type {
  PersonRating,
  VideoMetadata,
} from "@/components/movie-detail/types";

interface MovieSidebarProps {
  title: string;
  posterUrl: string | null;
  filePath: string | null;
  showEmbedded: boolean;
  isPlaying: boolean;
  playError: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  isLoadingMetadata: boolean;
  videoMetadata: VideoMetadata | null;
  personRatings: Record<string, PersonRating>;
  onPlay: () => void;
  onEmbed: () => void;
  onPersonClick?: (name: string) => void;
}

export default function MovieSidebar({
  title,
  posterUrl,
  filePath,
  showEmbedded,
  isPlaying,
  playError,
  director,
  writer,
  actors,
  isLoadingMetadata,
  videoMetadata,
  personRatings,
  onPlay,
  onEmbed,
  onPersonClick,
}: MovieSidebarProps) {
  return (
    <div className="order-2 lg:order-1 lg:col-span-4 space-y-6">
      <MoviePoster
        title={title}
        posterUrl={posterUrl}
        filePath={filePath}
        showEmbedded={showEmbedded}
        isPlaying={isPlaying}
        onPlay={onPlay}
        onEmbed={onEmbed}
      />

      {playError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-[10px] font-bold uppercase tracking-wider text-center animate-in fade-in slide-in-from-top-2">
          ⚠️ {playError}
        </div>
      )}

      <CreditsSection
        director={director}
        writer={writer}
        actors={actors}
        isLoadingMetadata={isLoadingMetadata}
        personRatings={personRatings}
        onPersonClick={onPersonClick}
      />

      <TechnicalDetails
        videoMetadata={videoMetadata}
        isLoadingMetadata={isLoadingMetadata}
      />
    </div>
  );
}
