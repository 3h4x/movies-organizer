"use client";

import Button from "@/components/ui/Button";

interface MoviePosterProps {
  title: string;
  posterUrl: string | null;
  filePath?: string | null;
  showEmbedded?: boolean;
  isPlaying?: boolean;
  size?: "desktop" | "mobile";
  onPlay?: () => void;
  onEmbed?: () => void;
}

function hideBrokenPoster(image: HTMLImageElement) {
  image.style.display = "none";
  image.parentElement?.classList.add(
    "flex",
    "items-center",
    "justify-center",
    "bg-gray-800",
  );

  const span = document.createElement("span");
  span.className = "text-6xl opacity-30";
  span.innerText = "🎬";
  image.parentElement?.appendChild(span);
}

export default function MoviePoster({
  title,
  posterUrl,
  filePath,
  showEmbedded = false,
  isPlaying = false,
  size = "desktop",
  onPlay,
  onEmbed,
}: MoviePosterProps) {
  const poster = posterUrl ? (
    <div className="relative aspect-[2/3]">
      <img
        src={posterUrl}
        alt={title}
        className="w-full h-full object-cover rounded-2xl shadow-2xl border border-gray-700/30"
        onError={(event) => hideBrokenPoster(event.currentTarget)}
      />
    </div>
  ) : (
    <div className="w-full aspect-[2/3] bg-gray-800 rounded-2xl flex items-center justify-center border border-gray-700/30">
      <span className="text-6xl opacity-30">🎬</span>
    </div>
  );

  if (size === "mobile") {
    return <div className="lg:hidden mx-auto w-full max-w-[220px]">{poster}</div>;
  }

  return (
    <div className="hidden lg:block flex-shrink-0 relative group">
      {poster}

      {filePath && !showEmbedded && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-2xl backdrop-blur-[2px]">
          <div className="flex flex-col gap-3">
            <Button
              onClick={onPlay}
              disabled={isPlaying}
              className="flex items-center gap-3 rounded-xl bg-indigo-500 px-6 py-3 font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-500/20 transition-transform hover:scale-105 hover:bg-indigo-600 active:scale-95 disabled:opacity-50"
            >
              <span className="text-xl">{isPlaying ? "⏳" : "▶️"}</span>
              {isPlaying ? "Opening..." : "Play in VLC"}
            </Button>
            <button
              onClick={onEmbed}
              className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest backdrop-blur-md border border-white/10 flex items-center gap-3 transition-transform hover:scale-105 active:scale-95"
            >
              <span className="text-xl">📺</span>
              Embed Player
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
