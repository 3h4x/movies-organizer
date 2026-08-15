"use client";
// tamtam inspected 2026-05-21
import { useState, useCallback } from "react";
import type { RecConfig } from "@/lib/types";

interface UseSettingsParams {
  onGroupOrderLoaded: (order: string[]) => void;
  onConfigLoaded: (cfg: RecConfig) => void;
  setDisabledEngines: (engines: string[]) => void;
}

export function useSettings({
  onGroupOrderLoaded,
  onConfigLoaded,
  setDisabledEngines,
}: UseSettingsParams) {
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [tmdbKeySource, setTmdbKeySource] = useState<"env" | "db" | null>(null);
  const [epgEnabled, setEpgEnabled] = useState(true);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setLibraryPath(data.library_path);
    setTmdbKeySource(data.tmdb_api_key_source ?? null);
    setDisabledEngines(data.disabled_engines ?? []);
    setEpgEnabled(data.epg_enabled ?? true);
    if (data.rec_group_order?.length) onGroupOrderLoaded(data.rec_group_order);
    if (data.rec_config) onConfigLoaded(data.rec_config);
  }, [setDisabledEngines, onGroupOrderLoaded, onConfigLoaded]);

  return { libraryPath, setLibraryPath, tmdbKeySource, epgEnabled, fetchSettings };
}
