"use client";

import type { StandardizeMessage } from "@/components/movie-detail/types";

interface ManagementMenuProps {
  isOpen: boolean;
  isPersistedMovie: boolean;
  movieTitle: string;
  movieId: number;
  hasMatches: boolean;
  isMergeMode: boolean;
  standardizeMsg: StandardizeMessage | null;
  filePath: string | null;
  isRemoving: boolean;
  isDeletingDisk: boolean;
  onSearchTMDb?: (query: string, targetMovieId?: number) => void;
  onCloseMenu: () => void;
  onStartMerge: () => void;
  onRemoveMissing: () => void;
  onDeleteDiskOnly: () => void;
  onDeleteFull: () => void;
}

export default function ManagementMenu({
  isOpen,
  isPersistedMovie,
  movieTitle,
  movieId,
  hasMatches,
  isMergeMode,
  standardizeMsg,
  filePath,
  isRemoving,
  isDeletingDisk,
  onSearchTMDb,
  onCloseMenu,
  onStartMerge,
  onRemoveMissing,
  onDeleteDiskOnly,
  onDeleteFull,
}: ManagementMenuProps) {
  if (!isOpen || !isPersistedMovie) return null;

  return (
    <div
      className="absolute top-16 right-6 z-[90] w-64 overflow-hidden rounded-2xl border border-gray-700/50 bg-gray-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 space-y-1">
        {onSearchTMDb && (
          <button
            onClick={() => {
              onCloseMenu();
              onSearchTMDb(movieTitle, movieId);
            }}
            className="w-full text-left px-4 py-3 hover:bg-indigo-500/10 rounded-xl transition-colors flex items-center gap-3 group"
          >
            <span className="text-base group-hover:scale-110 transition-transform">
              🔄
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                Fix Metadata
              </span>
              <span className="text-[9px] text-indigo-500/60 font-bold uppercase tracking-tight">
                Search TMDb for correct match
              </span>
            </div>
          </button>
        )}

        {!isMergeMode && (
          <button
            onClick={() => {
              onCloseMenu();
              onStartMerge();
            }}
            className="w-full text-left px-4 py-3 hover:bg-indigo-500/10 rounded-xl transition-colors flex items-center gap-3 group"
          >
            <span className="text-base group-hover:scale-110 transition-transform">
              🔗
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Merge Duplicates
                </span>
                {hasMatches && (
                  <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                )}
              </div>
              <span className="text-[9px] text-indigo-500/60 font-bold uppercase tracking-tight">
                Combine two entries into one
              </span>
            </div>
          </button>
        )}

        {standardizeMsg?.code === "FILE_NOT_FOUND" && (
          <button
            onClick={() => {
              onCloseMenu();
              onRemoveMissing();
            }}
            disabled={isRemoving}
            className="w-full text-left px-4 py-3 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3 group"
          >
            <span className="text-base group-hover:scale-110 transition-transform">
              🗑️
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                Remove Missing Entry
              </span>
              <span className="text-[9px] text-red-500/60 font-bold uppercase tracking-tight">
                File not found, clean up library
              </span>
            </div>
          </button>
        )}

        {filePath && (
          <button
            onClick={() => {
              onCloseMenu();
              onDeleteDiskOnly();
            }}
            disabled={isDeletingDisk}
            className="w-full text-left px-4 py-3 hover:bg-orange-500/10 rounded-xl transition-colors flex items-center gap-3 group"
          >
            <span className="text-base group-hover:scale-110 transition-transform">
              📂
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                Delete Files
              </span>
              <span className="text-[9px] text-orange-500/60 font-bold uppercase tracking-tight">
                Remove from disk, keep in library
              </span>
            </div>
          </button>
        )}

        {filePath && (
          <button
            onClick={() => {
              onCloseMenu();
              onDeleteFull();
            }}
            disabled={isDeletingDisk}
            className="w-full text-left px-4 py-3 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3 group"
          >
            <span className="text-base group-hover:scale-110 transition-transform">
              🔥
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                Remove from Library
              </span>
              <span className="text-[9px] text-red-500/60 font-bold uppercase tracking-tight">
                Delete files and library entry
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
