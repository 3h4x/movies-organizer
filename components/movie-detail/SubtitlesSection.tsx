"use client";

import type { DragEvent } from "react";
import type { SubtitleTrack } from "@/components/movie-detail/types";

interface SubtitlesSectionProps {
  movieTitle: string;
  filePath: string | null;
  hasSubtitles: boolean;
  subtitlesList: SubtitleTrack[];
  isSubtitleUploading: boolean;
  isDraggingSub: boolean;
  subtitleError: string | null;
  onDragOver: (event: DragEvent<HTMLLabelElement>) => void;
  onDragLeave: (event: DragEvent<HTMLLabelElement>) => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onSubtitleUpload: (file: File) => void;
}

export default function SubtitlesSection({
  movieTitle,
  filePath,
  hasSubtitles,
  subtitlesList,
  isSubtitleUploading,
  isDraggingSub,
  subtitleError,
  onDragOver,
  onDragLeave,
  onDrop,
  onSubtitleUpload,
}: SubtitlesSectionProps) {
  const openSubtitlesUrl = `https://www.opensubtitles.org/en/search2/moviename-${encodeURIComponent(movieTitle)}/sublanguageid-pol`;

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
        Subtitle Management
      </p>
      <div className="bg-gray-800/30 rounded-2xl p-5 border border-gray-700/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⌨️</span>
            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
              Available Tracks
            </span>
          </div>
          {hasSubtitles && (
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
              Standardized
            </span>
          )}
        </div>

        {filePath ? (
          <div className="space-y-4">
            {subtitlesList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {subtitlesList.map((sub, index) => (
                  <div
                    key={`${sub.name}-${index}`}
                    className="flex items-center gap-3 bg-gray-900/60 px-3 py-2 rounded-xl border border-gray-700/20 group"
                  >
                    <span className="text-indigo-500 font-black text-[9px] tracking-tighter">
                      POL
                    </span>
                    <span className="text-xs text-gray-400 truncate flex-1">
                      {sub.name}
                    </span>
                    <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-gray-600">
                      {sub.name.slice(sub.name.lastIndexOf(".")) || "?"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-900/40 rounded-2xl border border-dashed border-gray-700/50">
                <p className="text-gray-500 text-xs font-medium">
                  No localized subtitles found in movie folder.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <a
                href={openSubtitlesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 py-3 rounded-xl transition-all"
              >
                <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">
                  Search OpenSubtitles
                </span>
                <span className="text-sm">↗</span>
              </a>

              <label
                className={`cursor-pointer border-2 border-dashed rounded-xl transition-all flex items-center justify-center gap-3 py-3 ${
                  isSubtitleUploading
                    ? "bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed"
                    : isDraggingSub
                      ? "bg-indigo-500/10 border-indigo-500 text-indigo-400 scale-[1.02]"
                      : "bg-gray-800/30 border-gray-700/50 text-gray-400 hover:bg-indigo-500/5 hover:border-indigo-500/30 hover:text-indigo-300"
                }`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <span className="text-lg">
                  {isSubtitleUploading
                    ? "⏳"
                    : isDraggingSub
                      ? "✨"
                      : "📁"}
                </span>
                <span className="text-xs font-black uppercase tracking-widest">
                  {isSubtitleUploading
                    ? "Uploading..."
                    : isDraggingSub
                      ? "Drop Subtitle"
                      : "Drop .srt / .sub / .txt here"}
                </span>
                <input
                  type="file"
                  accept=".srt,.sub,.txt,.ass"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onSubtitleUpload(file);
                  }}
                  disabled={isSubtitleUploading}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm mb-4 italic">
              Metadata only. Link a local file to manage subtitles.
            </p>
            <a
              href={openSubtitlesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors"
            >
              OpenSubtitles.org ↗
            </a>
          </div>
        )}

        {subtitleError && (
          <p className="mt-3 px-3 py-2 bg-red-500/10 text-red-400 text-[10px] font-bold uppercase rounded-lg border border-red-500/20 text-center">
            {subtitleError}
          </p>
        )}
      </div>
    </div>
  );
}
