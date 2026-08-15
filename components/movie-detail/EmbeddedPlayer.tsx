"use client";

import type { SubtitleTrack } from "@/components/movie-detail/types";

interface EmbeddedPlayerProps {
  movieId: number;
  posterUrl: string | null;
  filePath: string;
  extraFiles: string[];
  activePart: number;
  subtitlesList: SubtitleTrack[];
  onSelectPart: (part: number) => void;
  onClose: () => void;
}

export default function EmbeddedPlayer({
  movieId,
  posterUrl,
  filePath,
  extraFiles,
  activePart,
  subtitlesList,
  onSelectPart,
  onClose,
}: EmbeddedPlayerProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">
            Embedded Player
          </p>
          {extraFiles.length > 0 && (
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
              {[filePath, ...extraFiles].map((_, index) => (
                <button
                  key={index}
                  onClick={() => onSelectPart(index)}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                    activePart === index
                      ? "bg-indigo-500 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Part {index + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-[10px] text-gray-500 hover:text-white font-black uppercase tracking-widest"
        >
          Close Player ×
        </button>
      </div>
      <div className="bg-black rounded-2xl overflow-hidden aspect-video border border-gray-800 shadow-2xl relative group">
        <video
          key={`${movieId}-${activePart}`}
          controls
          className="w-full h-full"
          poster={posterUrl || undefined}
          autoPlay
        >
          <source
            src={`/api/movies/${movieId}/stream?part=${activePart}`}
            type="video/mp4"
          />
          {subtitlesList.map((subtitle, index) => (
            <track
              key={`${subtitle.name}-${index}`}
              kind="subtitles"
              src={`/api/movies/${movieId}/stream?part=${activePart}&sub=${encodeURIComponent(subtitle.name)}`}
              srcLang="pl"
              label={`Polish (${subtitle.name})`}
            />
          ))}
          Your browser does not support the video tag.
        </video>
      </div>
      <p className="text-[10px] text-gray-500 italic text-center">
        Note: MKV support varies by browser. Use "Play in VLC" for best
        compatibility.
      </p>
    </div>
  );
}
