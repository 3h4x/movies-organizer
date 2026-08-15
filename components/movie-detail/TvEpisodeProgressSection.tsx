"use client";

import { useEffect, useState } from "react";

interface TvEpisodeProgress {
  id: number;
  season_number: number;
  episode_number: number;
  watched_at: string;
}

interface TvEpisodeProgressSectionProps {
  movieId: number;
}

interface TvEpisodeProgressResponse {
  episodes?: TvEpisodeProgress[];
  error?: string;
}

function formatWatchedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("pl", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function TvEpisodeProgressSection({
  movieId,
}: TvEpisodeProgressSectionProps) {
  const [episodes, setEpisodes] = useState<TvEpisodeProgress[]>([]);
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadProgress() {
      try {
        const res = await fetch(`/api/movies/${movieId}/episodes`);
        const data = (await res.json()) as TvEpisodeProgressResponse;
        if (ignore) return;
        if (data.error) {
          setError(data.error);
          setEpisodes([]);
        } else {
          setError(null);
          setEpisodes(data.episodes ?? []);
        }
      } catch {
        if (!ignore) setError("Failed to load episode progress");
      }
    }

    void loadProgress();

    return () => {
      ignore = true;
    };
  }, [movieId]);

  async function markWatched() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/movies/${movieId}/episodes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season_number: seasonNumber,
          episode_number: episodeNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save progress");
      setEpisodes((current) => [
        data.episode,
        ...current.filter((ep) => ep.id !== data.episode.id),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save progress");
    } finally {
      setIsSaving(false);
    }
  }

  async function clearWatched(episode: TvEpisodeProgress) {
    setIsSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        season_number: String(episode.season_number),
        episode_number: String(episode.episode_number),
      });
      const res = await fetch(`/api/movies/${movieId}/episodes?${params}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear progress");
      setEpisodes((current) => current.filter((ep) => ep.id !== episode.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear progress");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
        Episode Progress
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            Season
          </span>
          <input
            type="number"
            min={1}
            value={seasonNumber}
            onChange={(e) => setSeasonNumber(Math.max(1, Number(e.target.value) || 1))}
            className="h-11 w-20 rounded-lg border border-gray-700/50 bg-gray-800/60 px-3 text-sm text-white focus:border-indigo-500/50 focus:outline-none"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            Episode
          </span>
          <input
            type="number"
            min={1}
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(Math.max(1, Number(e.target.value) || 1))}
            className="h-11 w-20 rounded-lg border border-gray-700/50 bg-gray-800/60 px-3 text-sm text-white focus:border-indigo-500/50 focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={markWatched}
          disabled={isSaving}
          className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark watched
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {episodes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {episodes.map((episode) => (
            <button
              key={episode.id}
              type="button"
              onClick={() => clearWatched(episode)}
              disabled={isSaving}
              title={`Clear S${episode.season_number}E${episode.episode_number}`}
              className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:border-red-500/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="font-semibold text-gray-100">
                S{episode.season_number}E{episode.episode_number}
              </span>
              <span className="ml-2 text-gray-500">
                {formatWatchedAt(episode.watched_at)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No watched episodes yet.</p>
      )}
    </section>
  );
}
