"use client";

import type {
  VideoAudioTrack,
  VideoMetadata,
} from "@/components/movie-detail/types";

interface TechnicalDetailsProps {
  videoMetadata: VideoMetadata | null;
  isLoadingMetadata: boolean;
}

function ResolutionBadge({ width }: { width: number }) {
  if (width >= 3840) {
    return (
      <span className="px-1 py-0.5 bg-yellow-500/10 text-yellow-500 text-[9px] font-black rounded border border-yellow-500/20">
        4K
      </span>
    );
  }

  if (width >= 1920) {
    return (
      <span className="px-1 py-0.5 bg-blue-500/10 text-blue-500 text-[9px] font-black rounded border border-blue-500/20">
        FHD
      </span>
    );
  }

  if (width >= 1280) {
    return (
      <span className="px-1 py-0.5 bg-green-500/10 text-green-400 text-[9px] font-black rounded border border-green-500/20">
        HD
      </span>
    );
  }

  return (
    <span className="px-1 py-0.5 bg-gray-500/10 text-gray-400 text-[9px] font-black rounded border border-gray-500/20 uppercase">
      SD
    </span>
  );
}

export default function TechnicalDetails({
  videoMetadata,
  isLoadingMetadata,
}: TechnicalDetailsProps) {
  if (!videoMetadata && !isLoadingMetadata) return null;

  const width = videoMetadata?.video?.width ?? 0;

  return (
    <div className="bg-gray-800/40 rounded-2xl p-5 border border-gray-700/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">
          Technical Details
        </h3>
        {isLoadingMetadata && (
          <span className="animate-pulse text-[10px] text-gray-500 font-bold uppercase">
            Loading...
          </span>
        )}
      </div>

      {videoMetadata?.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-red-400 text-xs">{videoMetadata.error}</p>
        </div>
      )}

      {videoMetadata && !videoMetadata.error && (
        <div className="grid grid-cols-2 gap-y-4 gap-x-2">
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
              Resolution
            </p>
            <div className="text-sm text-gray-200 font-medium flex items-center gap-1.5 flex-wrap">
              {videoMetadata.video?.width} × {videoMetadata.video?.height}
              <ResolutionBadge width={width} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
              Video Codec
            </p>
            <p className="text-sm text-gray-200 font-medium uppercase">
              {videoMetadata.video?.codec}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
              File Size
            </p>
            <p className="text-sm text-gray-200 font-medium">
              {((videoMetadata.size ?? 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
              Bitrate
            </p>
            <p className="text-sm text-gray-200 font-medium">
              {((videoMetadata.bitrate ?? 0) / 1000).toFixed(0)} kbps
            </p>
          </div>

          {videoMetadata.audio && videoMetadata.audio.length > 0 && (
            <div className="col-span-2 space-y-2 pt-2 border-t border-gray-700/30">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                Audio Tracks
              </p>
              <div className="space-y-2">
                {videoMetadata.audio.map(
                  (audio: VideoAudioTrack, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-gray-900/40 px-2.5 py-1.5 rounded-lg border border-gray-700/20"
                    >
                      <span className="text-xs text-gray-300 font-medium uppercase">
                        {audio.codec}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-bold">
                          {audio.channels} ch
                        </span>
                        {audio.language && (
                          <span className="px-1 py-0.5 bg-indigo-500/10 text-indigo-400 text-[9px] font-black rounded border border-indigo-500/20 uppercase">
                            {audio.language}
                          </span>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
