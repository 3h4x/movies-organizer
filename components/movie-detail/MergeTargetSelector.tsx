"use client";

import type { MovieDetailMovie } from "@/components/movie-detail/types";

interface MergeTargetSelectorProps {
  variant: "compact" | "full";
  mergeQuery: string;
  potentialMerges: MovieDetailMovie[];
  isMerging: boolean;
  onQueryChange: (query: string) => void;
  onCancel: () => void;
  onMerge: (targetId: number) => void;
}

export default function MergeTargetSelector({
  variant,
  mergeQuery,
  potentialMerges,
  isMerging,
  onQueryChange,
  onCancel,
  onMerge,
}: MergeTargetSelectorProps) {
  if (variant === "compact") {
    return (
      <div className="bg-gray-800 p-4 rounded-2xl border border-indigo-500/30 animate-in fade-in zoom-in-95 duration-200 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">
            Merge target:
          </span>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-white text-[10px] font-bold uppercase tracking-wider"
          >
            cancel
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={mergeQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search movie..."
          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-3"
        />
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
          {potentialMerges.map((movie) => (
            <button
              key={movie.id}
              onClick={() => onMerge(movie.id)}
              disabled={isMerging}
              className="w-full text-left px-3 py-2 hover:bg-indigo-500/10 rounded-xl text-xs text-gray-300 hover:text-white flex items-center justify-between group transition-colors"
            >
              <span className="truncate">
                {movie.title}{" "}
                <span className="text-gray-500 font-bold ml-1">
                  [{movie.year}]
                </span>
              </span>
              <span className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-indigo-400 font-black uppercase text-[9px] ml-2 tracking-tighter">
                Merge →
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/40 rounded-2xl p-6 border border-indigo-500/30 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">
          Merge movie records
        </h4>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search library to find target movie..."
          value={mergeQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-all pl-10"
          autoFocus
        />
        <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30">
          🔍
        </span>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {potentialMerges.length > 0 ? (
          potentialMerges.map((movie) => (
            <button
              key={movie.id}
              onClick={() => onMerge(movie.id)}
              disabled={isMerging}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-900/40 hover:bg-indigo-500/10 border border-gray-700/30 hover:border-indigo-500/30 transition-all group text-left"
            >
              <div>
                <p className="text-xs font-bold text-gray-200 group-hover:text-indigo-300 transition-colors">
                  {movie.title}{" "}
                  {movie.year && (
                    <span className="text-gray-500">({movie.year})</span>
                  )}
                </p>
                <p className="text-[10px] text-gray-500 font-medium">
                  {movie.source} • {movie.file_path ? "Local" : "Remote"}
                </p>
              </div>
              <span className="text-indigo-500/50 group-hover:text-indigo-500 transition-colors">
                →
              </span>
            </button>
          ))
        ) : (
          <p className="text-center py-4 text-gray-500 text-xs italic">
            {mergeQuery
              ? "No matching movies found."
              : "Search or select from suggestions below..."}
          </p>
        )}
      </div>

      <p className="text-[9px] text-gray-500 leading-relaxed italic">
        Note: Metadata from this record will be moved to the target if it's more
        complete. This record will be permanently deleted.
      </p>
    </div>
  );
}
