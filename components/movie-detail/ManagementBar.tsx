"use client";

import Button from "@/components/ui/Button";

interface ManagementBarProps {
  filePath: string | null;
  isPlaying: boolean;
  isPersistedMovie: boolean;
  isMenuOpen: boolean;
  onPlay: () => void;
  onOpenFolder: () => void;
  onToggleMenu: () => void;
  onClose: () => void;
}

export default function ManagementBar({
  filePath,
  isPlaying,
  isPersistedMovie,
  isMenuOpen,
  onPlay,
  onOpenFolder,
  onToggleMenu,
  onClose,
}: ManagementBarProps) {
  return (
    <div className="shrink-0 flex items-center justify-end gap-2 px-3 sm:px-6 pt-3 pb-3">
      {filePath && (
        <div className="flex items-center gap-2 mr-2">
          <Button
            onClick={onPlay}
            disabled={isPlaying}
            className="group flex min-h-11 items-center gap-2 rounded-xl bg-indigo-500 px-3.5 py-2 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-600 disabled:opacity-50"
            title="Play Movie"
            aria-label="Play movie"
          >
            <span className="text-base group-hover:scale-110 transition-transform">
              {isPlaying ? "⏳" : "▶️"}
            </span>
            <span className="text-xs uppercase tracking-wider hidden sm:inline">
              Play
            </span>
          </Button>
          <button
            onClick={onOpenFolder}
            className="flex items-center justify-center w-11 h-11 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50 group"
            title="Open in Finder"
            aria-label="Open in Finder"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">
              📂
            </span>
          </button>
        </div>
      )}
      {isPersistedMovie && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            isMenuOpen
              ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
              : "bg-gray-800/80 text-gray-500 hover:text-white hover:bg-gray-800"
          }`}
          title="Management Menu"
          aria-label={isMenuOpen ? "Close management menu" : "Open management menu"}
        >
          <span className="text-xl">⋮</span>
        </button>
      )}
      <button
        onClick={onClose}
        className="w-11 h-11 bg-gray-800/80 hover:bg-gray-800 text-gray-500 hover:text-white rounded-xl flex items-center justify-center transition-all text-xl"
        title="Close"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}
