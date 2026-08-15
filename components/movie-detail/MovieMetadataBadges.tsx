"use client";

interface MovieMetadataBadgesProps {
  year: number | null;
  source: string | null;
  filePath: string | null;
}

export default function MovieMetadataBadges({
  year,
  source,
  filePath,
}: MovieMetadataBadgesProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {year && (
        <span className="px-2 py-1 bg-white/5 text-gray-300 text-sm font-bold rounded-lg border border-white/10">
          {year}
        </span>
      )}
      {source && (
        <span className="text-[10px] font-black px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg uppercase tracking-widest border border-indigo-500/20">
          {source === "tmdb" ? "TMDb" : source.toUpperCase()}
        </span>
      )}
      {filePath && (
        <span className="text-[10px] font-black px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg uppercase tracking-widest border border-emerald-500/20 flex items-center gap-1">
          <span className="text-[12px]">📂</span> FILE
        </span>
      )}
    </div>
  );
}
