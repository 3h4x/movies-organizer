"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { EPG_PRESETS } from "@/lib/epg-presets";
import type { TmdbHealthSnapshot } from "@/lib/tmdb-health";
import type { RecConfig } from "@/lib/types";
import type { Movie } from "@/lib/db";
import Button from "@/components/ui/Button";

export type { RecConfig };

const ALL_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "TV Movie",
  "Thriller",
  "War",
  "Western",
];

const DEFAULTS: RecConfig = {
  excluded_genres: [],
  min_year: null,
  min_rating: null,
  max_per_group: 15,
  movie_seed_min_rating: 7,
  movie_seed_count: 10,
  use_tmdb_similar: true,
  actor_min_appearances: 2,
  director_min_films: 2,
  top_genre_count: 6,
};

interface ConfigPanelProps {
  config: RecConfig;
  onSave: (config: RecConfig) => void;
  tmdbKeySource: "env" | "db" | null;
  disabledEngines: string[];
  engines: { value: string; label: string }[];
  onToggleEngine: (engineKey: string) => void;
  libraryPath: string | null;
  onSaveLibraryPath: (path: string) => Promise<boolean>;
  onSync: () => void;
  onOpenMovie: (id: number) => void;
  addToast: (message: string, variant?: "default" | "success") => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-5">
      {children}
    </h2>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-white font-semibold text-sm mb-1">{children}</h3>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-500 text-xs mb-3">{children}</p>;
}

const PILL_ACTIVE_CLASS = {
  indigo: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  green: "bg-green-500/20 text-green-300 border-green-500/30",
  red: "bg-red-500/20 text-red-300 border-red-500/30",
} as const;

function PillButton({
  active,
  onClick,
  children,
  color = "indigo",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: "indigo" | "yellow" | "green" | "red";
}) {
  const activeClass = PILL_ACTIVE_CLASS[color];
  return (
    <button
      onClick={onClick}
      className={`min-h-11 rounded-lg border px-3 py-2 text-xs transition-all ${
        active
          ? activeClass
          : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

type ConfigTab = "library" | "integrations" | "recommendations" | "tv";

const CONFIG_TABS: { value: ConfigTab; label: string }[] = [
  { value: "library", label: "Library" },
  { value: "integrations", label: "Integrations" },
  { value: "recommendations", label: "Recommendations" },
  { value: "tv", label: "TV" },
];

export function shouldSubmitApiKey(apiKey: string, apiKeySaving: boolean) {
  return apiKey.trim().length > 0 && !apiKeySaving;
}

export default function ConfigPanel({
  config,
  onSave,
  tmdbKeySource,
  disabledEngines,
  engines,
  onToggleEngine,
  libraryPath,
  onSaveLibraryPath,
  onSync,
  onOpenMovie,
  addToast,
}: ConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("library");
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<RecConfig>(config);
  const [dirty, setDirty] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySource, setApiKeySource] = useState(tmdbKeySource);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [pathDraft, setPathDraft] = useState(libraryPath || "");
  const [pathSaving, setPathSaving] = useState(false);
  const [pathSaved, setPathSaved] = useState(false);
  const [backupState, setBackupState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [backupFile, setBackupFile] = useState<string | null>(null);
  const [backupStats, setBackupStats] = useState<{ lastBackup: string | null; count: number } | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [cdaInterval, setCdaInterval] = useState<0 | 6 | 12 | 24>(0);
  const [cdaStatus, setCdaStatus] = useState<"idle" | "running" | "error">("idle");
  const [cdaLastRefresh, setCdaLastRefresh] = useState<string | null>(null);
  const [cdaMovieCount, setCdaMovieCount] = useState<number | null>(null);
  const [cdaDeadCount, setCdaDeadCount] = useState<number | null>(null);
  const [tmdbHealth, setTmdbHealth] = useState<TmdbHealthSnapshot | null>(null);
  const [tmdbRefreshState, setTmdbRefreshState] = useState<"idle" | "running">("idle");

  // EPG / TV
  const [tvHideUnrated, setTvHideUnrated] = useState(true);
  const [epgEnabled, setEpgEnabled] = useState(true);
  const [epgUrl, setEpgUrlDraft] = useState("");
  const [epgInterval, setEpgInterval] = useState<0 | 6 | 12 | 24>(0);
  const [epgStatus, setEpgStatus] = useState<"idle" | "running" | "error">("idle");
  const [epgLastRefresh, setEpgLastRefresh] = useState<string | null>(null);
  const [epgUrlSaving, setEpgUrlSaving] = useState(false);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [detachedMovies, setDetachedMovies] = useState<Movie[]>([]);
  const [detachedLoaded, setDetachedLoaded] = useState(false);
  const [detachedVisibleCount, setDetachedVisibleCount] = useState(100);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setDraft({ ...DEFAULTS, ...config });
    setDirty(false);
  }, [config]);

  useEffect(() => { setApiKeySource(tmdbKeySource); }, [tmdbKeySource]);
  useEffect(() => { setPathDraft(libraryPath || ""); }, [libraryPath]);

  useEffect(() => {
    if (activeTab !== "library" || detachedLoaded) return;
    setDetachedLoaded(true);
    fetch("/api/movies?detached=1")
      .then((r) => r.json())
      .then((movies: Movie[]) => {
        setDetachedMovies(movies);
        setDetachedVisibleCount(100);
      })
      .catch(() => {});
  }, [activeTab, detachedLoaded]);

  async function handleDeleteDetached(id: number) {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/movies/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDetachedMovies((prev) => prev.filter((m) => m.id !== id));
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  useEffect(() => {
    fetch("/api/backup").then((r) => r.json()).then(setBackupStats);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setBackupEnabled(s.backup_enabled ?? true);
        setCdaInterval(s.cda_refresh_interval_hours ?? 0);
        setCdaStatus(s.cda_refresh_status ?? "idle");
        setCdaLastRefresh(s.cda_last_refresh ?? null);
        setCdaMovieCount(s.cda_movie_count ?? null);
        setCdaDeadCount(s.cda_dead_link_count ?? null);
        setTvHideUnrated(s.tv_hide_unrated ?? true);
        setEpgEnabled(s.epg_enabled ?? true);
        setEpgUrlDraft(s.epg_url ?? "");
        setEpgInterval(s.epg_refresh_interval_hours ?? 0);
        setEpgStatus(s.epg_status ?? "idle");
        setEpgLastRefresh(s.epg_last_refresh ?? null);
      });
    fetch("/api/tv/blacklist")
      .then((r) => r.json())
      .then((list: string[]) => setBlacklist(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab !== "integrations") return;

    let cancelled = false;

    async function loadTmdbHealth() {
      try {
        const res = await fetch("/api/tmdb-health");
        if (!res.ok) return;
        const data = (await res.json()) as TmdbHealthSnapshot;
        if (!cancelled) setTmdbHealth(data);
      } catch {
        // Keep config usable even if the process-local debug endpoint is unavailable.
      }
    }

    void loadTmdbHealth();
    const timer = setInterval(() => {
      void loadTmdbHealth();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTab]);

  useEffect(() => {
    if (cdaStatus !== "running") return;
    const timer = setInterval(() => {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((s) => {
          setCdaStatus(s.cda_refresh_status ?? "idle");
          if (s.cda_refresh_status !== "running") {
            setCdaLastRefresh(s.cda_last_refresh ?? null);
            setCdaMovieCount(s.cda_movie_count ?? null);
          }
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [cdaStatus]);

  useEffect(() => {
    if (epgStatus !== "running") return;
    const timer = setInterval(() => {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((s) => {
          setEpgStatus(s.epg_status ?? "idle");
          if (s.epg_status !== "running") {
            setEpgLastRefresh(s.epg_last_refresh ?? null);
          }
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [epgStatus]);

  useEffect(() => {
    const container = tabsRef.current;
    if (!container) return;
    const activeButton = container.querySelector<HTMLButtonElement>(
      '[data-active="true"]',
    );
    if (!activeButton) return;

    const edgePadding = 40;
    const left = activeButton.offsetLeft;
    const right = left + activeButton.offsetWidth;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth - edgePadding;

    if (left < visibleLeft) {
      container.scrollTo({ left: Math.max(left - edgePadding, 0) });
      return;
    }
    if (right > visibleRight) {
      container.scrollTo({
        left: right - container.clientWidth + edgePadding,
      });
    }
  }, [activeTab]);

  async function handleBackup() {
    setBackupState("running");
    setBackupFile(null);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupFile(data.filename);
      setBackupState("done");
      fetch("/api/backup").then((r) => r.json()).then(setBackupStats);
      setTimeout(() => setBackupState("idle"), 4000);
    } catch {
      setBackupState("error");
      setTimeout(() => setBackupState("idle"), 3000);
    }
  }

  async function handleSavePath() {
    setPathSaved(false);
    setPathSaving(true);
    const saved = await onSaveLibraryPath(pathDraft.trim());
    setPathSaving(false);
    if (!saved) return;
    setPathSaved(true);
    setTimeout(() => setPathSaved(false), 2000);
  }

  function update(partial: Partial<RecConfig>) {
    setDraft((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }

  function toggleGenre(genre: string) {
    const excluded = draft.excluded_genres.includes(genre)
      ? draft.excluded_genres.filter((g) => g !== genre)
      : [...draft.excluded_genres, genre];
    update({ excluded_genres: excluded });
  }

  function handleSave() {
    onSave(draft);
    setDirty(false);
  }

  function handleReset() {
    setDraft(DEFAULTS);
    setDirty(true);
  }

  async function saveApiKey(value: string) {
    setApiKeySaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_api_key: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        addToast(data.error || "Failed to save TMDb API key");
        return;
      }
      setApiKeySource(value.trim() ? "db" : null);
      setApiKey("");
    } catch {
      addToast("Failed to save TMDb API key");
    } finally {
      setApiKeySaving(false);
    }
  }

  function handleApiKeySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shouldSubmitApiKey(apiKey, apiKeySaving)) return;
    void saveApiKey(apiKey);
  }

  async function handleRefreshStaleMetadata() {
    setTmdbRefreshState("running");
    try {
      const res = await fetch("/api/movies/refresh-stale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        updated?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok) {
        addToast(data.error || "Failed to refresh stale metadata");
        return;
      }
      addToast(
        `Metadata refreshed: ${data.updated ?? 0} updated, ${data.skipped ?? 0} skipped`,
        "success",
      );
    } catch {
      addToast("Failed to refresh stale metadata");
    } finally {
      setTmdbRefreshState("idle");
    }
  }

  return (
    <div className="max-w-2xl space-y-8">

      {/* Tab nav */}
      <div className="relative">
        <div
          ref={tabsRef}
          data-testid="config-tab-strip"
          className="flex gap-1 bg-gray-800/40 p-1 rounded-xl overflow-x-auto pr-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
        {CONFIG_TABS.map((tab) => (
          <button
            key={tab.value}
            data-active={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.value
                ? "bg-gray-700/80 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-700/30"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div aria-hidden className="shrink-0 w-6 sm:hidden" />
        </div>
        {/* Right-edge fade to indicate horizontal scroll on small screens */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-gray-900 to-transparent rounded-r-xl sm:hidden" />
      </div>

      {/* ── Library ─────────────────────────────────────────── */}
      {activeTab === "library" && <div>
        <SectionHeader>Library</SectionHeader>
        <div className="space-y-8">

          <section>
            <SubHeader>Library Path</SubHeader>
            <Hint>Directory to scan for video files. Used for import and sync.</Hint>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSavePath()}
                placeholder="/Volumes/video/Movies"
                className="h-11 flex-1 min-w-0 rounded-lg border border-gray-700/30 bg-gray-800/60 px-3 text-sm font-mono text-white placeholder-gray-600 focus:border-indigo-500/50 focus:outline-none"
              />
              <Button
                onClick={handleSavePath}
                disabled={pathSaving || !pathDraft.trim() || pathDraft.trim() === libraryPath}
                className="min-h-11 shrink-0 rounded-lg px-4 py-2 text-sm"
              >
                {pathSaving ? "Saving..." : pathSaved ? "Saved" : "Save"}
              </Button>
              {libraryPath && (
                <button
                  onClick={onSync}
                  className="min-h-11 shrink-0 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-600 hover:text-white"
                >
                  Sync Now
                </button>
              )}
            </div>
            {libraryPath && (
              <p className="text-gray-600 text-xs mt-2 font-mono">Current: {libraryPath}</p>
            )}
          </section>

          <section>
            <SubHeader>Database Backup</SubHeader>
            <Hint>
              Auto-backup every 15 minutes with tiered retention. Stored in{" "}
              <span className="font-mono">data/backups/</span>.
            </Hint>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={async () => {
                  const next = !backupEnabled;
                  setBackupEnabled(next);
                  const res = await fetch("/api/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ backup_enabled: next }),
                  });
                  if (!res.ok) setBackupEnabled(!next);
                }}
                className={`min-h-11 rounded-lg px-4 py-2 text-sm transition-colors ${
                  backupEnabled
                    ? "bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30"
                    : "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                }`}
              >
                {backupEnabled ? "Auto-backup: On" : "Auto-backup: Off"}
              </button>
              <button
                onClick={handleBackup}
                disabled={backupState === "running"}
                className="min-h-11 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {backupState === "running" ? "Backing up..." : "Backup Now"}
              </button>
              {backupState === "done" && backupFile && (
                <span className="text-green-400 text-xs font-mono">{backupFile}</span>
              )}
              {backupState === "error" && (
                <span className="text-red-400 text-xs">Backup failed</span>
              )}
            </div>
            {backupStats && (
              <div className="text-xs text-gray-500 space-y-0.5">
                {backupStats.lastBackup && (
                  <p>Last: <span className="font-mono text-gray-400">{backupStats.lastBackup}</span></p>
                )}
                <p>Stored: <span className="text-gray-400">{backupStats.count}</span></p>
              </div>
            )}
          </section>

          <section>
            <SubHeader>Detached Files</SubHeader>
            <Hint>Movies in your library with no local file. Open the detail to relink, or delete the record.</Hint>
            {detachedMovies.length === 0 ? (
              <p className="text-gray-700 text-sm">No detached movies.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Showing {Math.min(detachedVisibleCount, detachedMovies.length)} of {detachedMovies.length}
                </p>
                <div className="space-y-1.5">
                  {detachedMovies.slice(0, detachedVisibleCount).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-700/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-300 text-sm font-medium truncate">
                          {m.pl_title || m.title}
                          {m.year ? <span className="text-gray-500 font-normal ml-1">({m.year})</span> : null}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {m.user_rating != null && (
                            <span className="text-xs text-indigo-400">♥ {m.user_rating}</span>
                          )}
                          {m.wishlist === 1 && (
                            <span className="text-xs text-yellow-400">Wishlist</span>
                          )}
                          {m.tmdb_id != null && (
                            <span className="text-xs text-gray-600">TMDb</span>
                          )}
                          {m.filmweb_id != null && (
                            <span className="text-xs text-gray-600">Filmweb</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onOpenMovie(m.id)}
                          className="flex min-h-11 items-center rounded-lg px-3 text-xs text-indigo-400 transition-colors hover:bg-white/5 hover:text-indigo-300"
                        >
                          Open
                        </button>
                        <button
                          disabled={deletingIds.has(m.id)}
                          onClick={() => void handleDeleteDetached(m.id)}
                          className="flex min-h-11 items-center rounded-lg px-3 text-xs text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                        >
                          {deletingIds.has(m.id) ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {detachedVisibleCount < detachedMovies.length && (
                  <button
                    onClick={() =>
                      setDetachedVisibleCount((prev) =>
                        Math.min(prev + 100, detachedMovies.length),
                      )
                    }
                    className="min-h-11 rounded-lg bg-gray-800/50 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700/60 hover:text-white"
                  >
                    Load 100 More
                  </button>
                )}
              </div>
            )}
          </section>

        </div>
      </div>}

      {/* ── Integrations ────────────────────────────────────── */}
      {activeTab === "integrations" && <div>
        <SectionHeader>Integrations</SectionHeader>
        <div className="space-y-8">

          <section>
            <SubHeader>TMDb API Key</SubHeader>
            <Hint>
              Required for search and recommendations.{" "}
              {apiKeySource === "env" ? (
                <span className="text-green-400">Loaded from environment (bioenv)</span>
              ) : apiKeySource === "db" ? (
                <span className="text-yellow-400">Loaded from database (less secure)</span>
              ) : (
                <span className="text-red-400">Not configured</span>
              )}
            </Hint>
            {apiKeySource !== "env" && (
              <form className="flex flex-wrap items-center gap-2" onSubmit={handleApiKeySubmit}>
                <input
                  type="text"
                  name="tmdb-username"
                  autoComplete="username"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                  value="tmdb"
                  readOnly
                />
                <label htmlFor="tmdb-api-key" className="sr-only">
                  TMDb API key
                </label>
                <input
                  id="tmdb-api-key"
                  type="password"
                  autoComplete="new-password"
                  placeholder={apiKeySource === "db" ? "••••••••  (replace)" : "Paste TMDb read access token"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-11 min-w-0 flex-[1_1_14rem] rounded-lg border border-gray-700/30 bg-gray-800/60 px-3 text-sm text-white focus:border-indigo-500/50 focus:outline-none"
                />
                <Button
                  type="submit"
                  disabled={!apiKey.trim() || apiKeySaving}
                  className="min-h-11 shrink-0 rounded-lg px-4 py-2 text-sm"
                >
                  {apiKeySaving ? "Saving..." : "Save"}
                </Button>
                {apiKeySource === "db" && (
                  <button
                    type="button"
                    onClick={() => { void saveApiKey(""); }}
                    className="min-h-11 shrink-0 rounded-lg bg-red-600/20 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-600/30"
                  >
                    Remove
                  </button>
                )}
              </form>
            )}
          </section>

          <section>
            <SubHeader>TMDb Request Pressure</SubHeader>
            <Hint>Process-local counters for this running app instance. They reset on restart.</Hint>
            <div className="mb-3">
              <button
                disabled={tmdbRefreshState === "running"}
                onClick={() => void handleRefreshStaleMetadata()}
                className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tmdbRefreshState === "running" ? "Refreshing…" : "Refresh Stale Metadata"}
              </button>
            </div>
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-widest text-gray-500">Live requests</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {tmdbHealth?.liveRequestCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-widest text-gray-500">Cache hits</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {tmdbHealth?.cacheHitCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-widest text-gray-500">Retries</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {tmdbHealth?.retryCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-widest text-gray-500">Non-OK responses</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {tmdbHealth?.nonOkCount ?? 0}
                  </p>
                </div>
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <p>
                  Last error status:{" "}
                  <span className="text-gray-300">
                    {tmdbHealth?.lastErrorStatus ?? "None"}
                  </span>
                </p>
                <p>
                  Last error:{" "}
                  <span className="text-gray-300">
                    {tmdbHealth?.lastErrorMessage ?? "None"}
                  </span>
                </p>
                <p>
                  Last 429:{" "}
                  <span className="text-gray-300">
                    {tmdbHealth?.last429At ? new Date(tmdbHealth.last429At).toLocaleString() : "Never"}
                  </span>
                </p>
              </div>

              <div>
                <p className="mb-2 text-[11px] uppercase tracking-widest text-gray-500">By helper</p>
                {tmdbHealth && Object.keys(tmdbHealth.helpers).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(tmdbHealth.helpers)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([helper, stats]) => (
                        <div
                          key={helper}
                          className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-gray-400"
                        >
                          <p className="font-mono text-gray-200">{helper}</p>
                          <p className="mt-1">
                            requests {stats.liveRequestCount} · cache hits {stats.cacheHitCount} · retries {stats.retryCount} · non-OK {stats.nonOkCount}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No TMDb requests recorded in this process yet.</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <SubHeader>CDA Premium</SubHeader>
            <Hint>Auto-refresh the CDA catalog on a schedule.</Hint>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-2">Auto-refresh interval</p>
                <div className="flex gap-2">
                  {([0, 6, 12, 24] as const).map((h) => (
                    <PillButton
                      key={h}
                      active={cdaInterval === h}
                      color="indigo"
                      onClick={async () => {
                        const prev = cdaInterval;
                        setCdaInterval(h);
                        const res = await fetch("/api/settings", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ cda_refresh_interval_hours: h }),
                        });
                        if (!res.ok) setCdaInterval(prev);
                      }}
                    >
                      {h === 0 ? "Off" : `${h}h`}
                    </PillButton>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={cdaStatus === "running"}
                  onClick={async () => {
                    const res = await fetch("/api/cda-refresh", { method: "POST" });
                    if (res.ok) setCdaStatus("running");
                  }}
                  className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cdaStatus === "running" ? "Refreshing…" : "Refresh Now"}
                </button>
                {cdaStatus === "error" && (
                  <span className="text-xs text-red-400">Last refresh failed</span>
                )}
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>
                  Last refreshed:{" "}
                  <span className="text-gray-400">
                    {cdaLastRefresh ? new Date(cdaLastRefresh).toLocaleString() : "Never"}
                  </span>
                </p>
                {cdaMovieCount !== null && (
                  <p>Movies: <span className="text-gray-400">{cdaMovieCount.toLocaleString()}</span></p>
                )}
                {cdaDeadCount !== null && cdaDeadCount > 0 && (
                  <p>Dead links hidden: <span className="text-gray-400">{cdaDeadCount.toLocaleString()}</span></p>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>}

      {/* ── TV ──────────────────────────────────────────────── */}
      {activeTab === "tv" && <div>
        <SectionHeader>TV Guide</SectionHeader>
        <div className="space-y-8">

          <section>
            <SubHeader>EPG Source</SubHeader>
            <Hint>XMLTV feed for live TV schedule. Supports .xml and .xml.gz.</Hint>
            <div className="space-y-4">

              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    const next = !epgEnabled;
                    setEpgEnabled(next);
                    const res = await fetch("/api/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ epg_enabled: next }),
                    });
                    if (!res.ok) setEpgEnabled(!next);
                  }}
                  className={`min-h-11 rounded-lg border px-4 py-2 text-sm transition-colors ${
                    epgEnabled
                      ? "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
                      : "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30"
                  }`}
                >
                  {epgEnabled ? "TV Guide: On" : "TV Guide: Off"}
                </button>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-2">Country preset</p>
                <div className="flex flex-wrap gap-2">
                  {EPG_PRESETS.map((p) => (
                    <PillButton
                      key={p.url}
                      active={epgUrl === p.url}
                      color="indigo"
                      onClick={() => setEpgUrlDraft(p.url)}
                    >
                      {p.label}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-2">EPG URL (XMLTV or .xml.gz)</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={epgUrl}
                    onChange={(e) => setEpgUrlDraft(e.target.value)}
                    placeholder="https://epgshare01.online/epgshare01/epg_ripper_PL1.xml.gz"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-gray-700/30 bg-gray-800/60 px-3 text-sm font-mono text-white placeholder-gray-600 focus:border-indigo-500/50 focus:outline-none"
                  />
                  <Button
                    disabled={epgUrlSaving}
                    onClick={async () => {
                      setEpgUrlSaving(true);
                      await fetch("/api/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ epg_url: epgUrl }),
                      });
                      setEpgUrlSaving(false);
                    }}
                    className="min-h-11 shrink-0 rounded-lg px-4 py-2 text-sm"
                  >
                    {epgUrlSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
                {!epgUrl && (
                  <p className="text-gray-600 text-xs mt-1">Using default: Poland</p>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-2">Auto-refresh interval</p>
                <div className="flex gap-2">
                  {([0, 6, 12, 24] as const).map((h) => (
                    <PillButton
                      key={h}
                      active={epgInterval === h}
                      color="indigo"
                      onClick={async () => {
                        const prev = epgInterval;
                        setEpgInterval(h);
                        const res = await fetch("/api/settings", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ epg_refresh_interval_hours: h }),
                        });
                        if (!res.ok) setEpgInterval(prev);
                      }}
                    >
                      {h === 0 ? "Off" : `${h}h`}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  disabled={epgStatus === "running"}
                  onClick={async () => {
                    const res = await fetch("/api/tv/refresh", { method: "POST" });
                    if (res.ok) setEpgStatus("running");
                  }}
                  className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {epgStatus === "running" ? "Refreshing…" : "Refresh Now"}
                </button>
                {epgStatus === "error" && (
                  <span className="text-xs text-red-400">Last refresh failed</span>
                )}
                <span className="text-xs text-gray-600">
                  Last: {epgLastRefresh ? new Date(epgLastRefresh).toLocaleString() : "Never"}
                </span>
              </div>

            </div>
          </section>

          <section>
            <SubHeader>Filters</SubHeader>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300">Hide films without rating</p>
                  <p className="text-xs text-gray-600">Only show films that have a TMDb rating</p>
                </div>
                <button
                  onClick={async () => {
                    const next = !tvHideUnrated;
                    setTvHideUnrated(next);
                    const res = await fetch("/api/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tv_hide_unrated: next }),
                    });
                    if (!res.ok) setTvHideUnrated(!next);
                  }}
                  className={`min-h-11 rounded-lg border px-4 py-2 text-sm transition-colors ${
                    tvHideUnrated
                      ? "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
                      : "bg-gray-700/40 text-gray-400 border-gray-700/50 hover:bg-gray-700/60"
                  }`}
                >
                  {tvHideUnrated ? "On" : "Off"}
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1">
              <SubHeader>Hidden Channels</SubHeader>
              {blacklist.length > 0 && (
                <button
                  onClick={async () => {
                    await fetch("/api/tv/blacklist", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify([]),
                    });
                    setBlacklist([]);
                  }}
                  className="min-h-11 rounded-lg px-3 text-xs text-gray-600 transition-colors hover:bg-white/[0.04] hover:text-gray-400"
                >
                  Clear all
                </button>
              )}
            </div>
            <Hint>Channels hidden via the × button in the TV tab. Remove entries to unhide.</Hint>
            {blacklist.length === 0 ? (
              <p className="text-gray-700 text-sm">No channels hidden.</p>
            ) : (
              <div className="space-y-1.5">
                {blacklist.map((id) => (
                  <div key={id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-700/30">
                    <span className="min-w-0 break-all text-gray-400 font-mono text-xs">{id}</span>
                    <button
                      onClick={async () => {
                        const next = blacklist.filter((x) => x !== id);
                        await fetch("/api/tv/blacklist", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(next),
                        });
                        setBlacklist(next);
                      }}
                      className="min-h-11 shrink-0 rounded-lg px-3 text-xs text-gray-600 transition-colors hover:bg-white/[0.05] hover:text-gray-300"
                    >
                      Unhide
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>}

      {/* ── Recommendations ─────────────────────────────────── */}
      {activeTab === "recommendations" && <div>
        <SectionHeader>Recommendations</SectionHeader>
        <div className="space-y-10">

          {/* Engines */}
          <section>
            <SubHeader>Engines</SubHeader>
            <Hint>Disabled engines won&apos;t run on page load or refresh.</Hint>
            <div className="flex flex-wrap gap-2">
              {engines.map((eng) => {
                const disabled = disabledEngines.includes(eng.value);
                return (
                  <button
                    key={eng.value}
                    onClick={() => onToggleEngine(eng.value)}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-xs transition-all ${
                      disabled
                        ? "bg-red-500/20 text-red-300 border-red-500/30"
                        : "bg-green-500/20 text-green-300 border-green-500/30"
                    }`}
                  >
                    {disabled ? "✕" : "✓"} {eng.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Filters */}
          <section>
            <SubHeader>Filters</SubHeader>
            <Hint>Applied to all recommendation results before they&apos;re shown.</Hint>
            <div className="space-y-5">

              {/* Excluded Genres */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Excluded genres</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onClick={() => {
                      const hasAnim = draft.excluded_genres.includes("Animation");
                      update({
                        excluded_genres: hasAnim
                          ? draft.excluded_genres.filter((g) => g !== "Animation")
                          : [...draft.excluded_genres, "Animation"],
                      });
                    }}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      draft.excluded_genres.includes("Animation")
                        ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                        : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-300"
                    }`}
                  >
                    {draft.excluded_genres.includes("Animation") ? "✕ No Animation" : "Exclude Animation"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_GENRES.map((genre) => {
                    const excluded = draft.excluded_genres.includes(genre);
                    return (
                      <button
                        key={genre}
                        onClick={() => toggleGenre(genre)}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-xs transition-all ${
                          excluded
                            ? "bg-red-500/20 text-red-300 border-red-500/30"
                            : "bg-gray-800/60 text-gray-400 border-gray-700/30 hover:border-gray-600/50 hover:text-gray-300"
                        }`}
                      >
                        {excluded && <span className="mr-1">✕</span>}
                        {genre}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Min Year + Min Rating side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-2">Minimum year</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={1900}
                      max={new Date().getFullYear()}
                      placeholder="Any"
                      value={draft.min_year ?? ""}
                      onChange={(e) =>
                        update({ min_year: e.target.value ? parseInt(e.target.value, 10) : null })
                      }
                      className="bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm w-24 focus:outline-none focus:border-indigo-500/50"
                    />
                    <div className="flex gap-1">
                      {[1990, 2000, 2010, 2020].map((year) => (
                        <PillButton
                          key={year}
                          active={draft.min_year === year}
                          color="indigo"
                          onClick={() => update({ min_year: draft.min_year === year ? null : year })}
                        >
                          {year}+
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2">Minimum TMDb rating</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      placeholder="Any"
                      value={draft.min_rating ?? ""}
                      onChange={(e) =>
                        update({ min_rating: e.target.value ? parseFloat(e.target.value) : null })
                      }
                      className="bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm w-24 focus:outline-none focus:border-indigo-500/50"
                    />
                    <div className="flex gap-1">
                      {[6, 6.5, 7, 7.5, 8].map((r) => (
                        <PillButton
                          key={r}
                          active={draft.min_rating === r}
                          color="yellow"
                          onClick={() => update({ min_rating: draft.min_rating === r ? null : r })}
                        >
                          {r}+
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {/* Engine Tuning */}
          <section>
            <SubHeader>Engine Tuning</SubHeader>
            <Hint>Controls how each recommendation engine selects candidates.</Hint>
            <div className="space-y-5">

              {/* Genre */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Genre</p>
                <p className="text-xs text-gray-500 mb-2">Top genres to use</p>
                <Hint>Only your top N genres (by rating sum) generate recommendation groups.</Hint>
                <div className="flex gap-1 flex-wrap">
                  {[3, 4, 5, 6, 8, 10].map((n) => (
                    <PillButton
                      key={n}
                      active={(draft.top_genre_count ?? 6) === n}
                      color="indigo"
                      onClick={() => update({ top_genre_count: n })}
                    >
                      {n}
                    </PillButton>
                  ))}
                </div>
              </div>

              {/* Similar Movies */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Similar Movies</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Seed min. rating</p>
                    <Hint>Only use movies you rated at least this highly as seeds.</Hint>
                    <div className="flex gap-1 flex-wrap">
                      {[5, 6, 7, 8, 9].map((r) => (
                        <PillButton
                          key={r}
                          active={draft.movie_seed_min_rating === r}
                          color="indigo"
                          onClick={() => update({ movie_seed_min_rating: r })}
                        >
                          {r}+
                        </PillButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2">Number of seeds</p>
                    <Hint>How many of your top-rated movies to use as seeds.</Hint>
                    <div className="flex gap-1 flex-wrap">
                      {[5, 10, 15, 20].map((n) => (
                        <PillButton
                          key={n}
                          active={draft.movie_seed_count === n}
                          color="indigo"
                          onClick={() => update({ movie_seed_count: n })}
                        >
                          {n}
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2">TMDb Similar endpoint</p>
                  <Hint>
                    Also fetch genre/keyword-matched movies alongside TMDb&apos;s curated recommendations.
                  </Hint>
                  <button
                    onClick={() => update({ use_tmdb_similar: !draft.use_tmdb_similar })}
                    className={`min-h-11 rounded-lg border px-4 py-2 text-sm transition-colors ${
                      draft.use_tmdb_similar
                        ? "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
                        : "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30"
                    }`}
                  >
                    {draft.use_tmdb_similar ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {/* People */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">People</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Actor min. appearances</p>
                    <Hint>An actor must appear in this many of your rated movies to qualify.</Hint>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <PillButton
                          key={n}
                          active={draft.actor_min_appearances === n}
                          color="indigo"
                          onClick={() => update({ actor_min_appearances: n })}
                        >
                          {n}
                        </PillButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2">Director min. films</p>
                    <Hint>A director must have directed this many of your rated movies to qualify.</Hint>
                    <div className="flex gap-1">
                      {[1, 2, 3].map((n) => (
                        <PillButton
                          key={n}
                          active={draft.director_min_films === n}
                          color="indigo"
                          onClick={() => update({ director_min_films: n })}
                        >
                          {n}
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Display */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Display</p>
                <p className="text-xs text-gray-500 mb-2">Results per group</p>
                <Hint>Maximum number of recommendations shown in each group.</Hint>
                <div className="flex gap-1">
                  {[5, 10, 15, 20, 30].map((n) => (
                    <PillButton
                      key={n}
                      active={draft.max_per_group === n}
                      color="indigo"
                      onClick={() => update({ max_per_group: n })}
                    >
                      {n}
                    </PillButton>
                  ))}
                </div>
              </div>

            </div>
          </section>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={!dirty}
              className={`min-h-11 rounded-lg px-5 py-2 text-sm font-medium transition-all ${
                dirty
                  ? "!bg-indigo-500 text-white hover:!bg-indigo-400 shadow-md shadow-indigo-500/20"
                  : "disabled:!bg-gray-800/60 disabled:!text-gray-600 disabled:!opacity-100 disabled:!cursor-default"
              }`}
            >
              Save & Refresh Recommendations
            </Button>
            <button
              onClick={handleReset}
              className="min-h-11 rounded-lg px-3 text-sm text-gray-500 transition-colors hover:bg-white/[0.04] hover:text-gray-300"
            >
              Reset to defaults
            </button>
            {dirty && (
              <span className="text-yellow-500/70 text-xs">Unsaved changes</span>
            )}
          </div>

        </div>
      </div>}

    </div>
  );
}
