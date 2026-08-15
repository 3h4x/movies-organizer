"use client";
// tamtam inspected 2026-05-21
import { useEffect, useRef } from "react";
import type { AppTab } from "@/lib/types";

interface AppNavProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  initialLoad: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  moviesCount: number;
  wishlistCount: number;
  totalRecsCount: number;
  categoryCounts: Record<string, number>;
  epgEnabled: boolean;
  libraryPath: string | null;
  onSync: () => void;
  onImport: () => void;
  onSearchEnter: (query: string) => Promise<void>;
}

export default function AppNav({
  activeTab,
  setActiveTab,
  initialLoad,
  searchQuery,
  setSearchQuery,
  moviesCount,
  wishlistCount,
  totalRecsCount,
  categoryCounts,
  epgEnabled,
  libraryPath,
  onSync,
  onImport,
  onSearchEnter,
}: AppNavProps) {
  const tabsRef = useRef<HTMLDivElement | null>(null);

  const tabs = [
    {
      key: "recommendations" as const,
      label: "Discover",
      count:
        categoryCounts["all"] > 0 ? categoryCounts["all"] : totalRecsCount,
    },
    {
      key: "library" as const,
      label: "Library",
      count: initialLoad ? -1 : moviesCount,
    },
    {
      key: "wishlist" as const,
      label: "Watchlist",
      count: initialLoad ? -1 : wishlistCount,
    },
    ...(epgEnabled ? [{ key: "tv" as const, label: "TV", count: -1 }] : []),
    { key: "config" as const, label: "Config", count: -1 },
  ];
  const tabLayoutKey = tabs.map((tab) => `${tab.key}:${tab.count}`).join("|");

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const container = tabsRef.current;
      if (!container) return;
      const activeButton = container.querySelector<HTMLButtonElement>(
        '[data-active="true"]',
      );
      if (!activeButton) return;

      const edgePadding = 16;
      const left = activeButton.offsetLeft - edgePadding;
      const right = activeButton.offsetLeft + activeButton.offsetWidth + edgePadding;
      const visibleLeft = container.scrollLeft;
      const visibleRight = container.scrollLeft + container.clientWidth;

      if (left < visibleLeft) {
        container.scrollTo({ left: Math.max(left, 0) });
        return;
      }
      if (right > visibleRight) {
        const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
        container.scrollTo({ left: Math.min(right - container.clientWidth, maxScrollLeft) });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTab, initialLoad, tabLayoutKey]);

  return (
    <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-0 bg-[#0a0e1a]/90 backdrop-blur-2xl border-b border-white/[0.05] shadow-[0_1px_0_0_rgba(255,255,255,0.03)]">
      <div className="max-w-7xl mx-auto">
        {/* Row 1: Logo + Actions */}
        <div
          data-testid="app-header-row"
          className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center justify-between gap-3 sm:justify-start sm:gap-4">
            <h1 className="text-lg font-bold tracking-tight">
              <a
                href="#recommendations"
                className="flex min-h-11 items-center gap-2 rounded-lg px-1.5 text-white transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                aria-label="Go to FilmPick home"
              >
                <img
                  src="/icon-192.png"
                  alt="FilmPick"
                  className="w-7 h-7 rounded-lg"
                />
                <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  FilmPick
                </span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400/80 border border-indigo-500/20">
                  {process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
                </span>
              </a>
            </h1>
          </div>
          {!initialLoad && (
            <div className="flex items-center gap-2">
              {activeTab === "library" && libraryPath && (
                <button
                  onClick={onSync}
                  aria-label="Sync library"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-all hover:bg-gray-800/60 hover:text-white"
                  title="Sync library"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}
              {activeTab === "library" && (
                <button
                  onClick={onImport}
                  aria-label="Import folder"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-all hover:bg-gray-800/60 hover:text-white"
                  title="Import folder"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {!initialLoad && (
          <div data-testid="app-search-row" className="mb-3 sm:-mt-1">
            <div className="relative group transition-all sm:max-w-xs">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  // The search box is "Search library...", but it renders on every
                  // tab. On tabs that aren't library/search, a page-level effect
                  // wipes searchQuery on change, making the input impossible to
                  // type into. Switch to the library tab so typing actually sticks.
                  if (activeTab !== "library" && activeTab !== "search") {
                    setActiveTab("library");
                  }
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    setActiveTab("search");
                    await onSearchEnter(searchQuery);
                  }
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    setActiveTab("library");
                  }
                }}
                placeholder="Search library..."
                aria-label="Search library"
                className="h-11 w-full rounded-lg border border-gray-700/50 bg-gray-800/40 pl-8 pr-8 text-sm text-white transition-all placeholder-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    if (activeTab === "search") setActiveTab("library");
                  }}
                  aria-label="Clear search"
                  className="absolute inset-y-0 right-2 flex items-center px-2 text-gray-500 hover:text-white"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Row 2: Tabs */}
        <div className="relative">
          <div
            ref={tabsRef}
            data-testid="app-tab-strip"
            className="flex gap-0.5 overflow-x-auto pr-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            <div aria-hidden className="shrink-0 w-4 sm:hidden" />
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  data-active={active}
                  onClick={() => setActiveTab(tab.key)}
                  aria-label={tab.count >= 0 ? `${tab.label} (${tab.count})` : tab.label}
                  className={`relative flex min-h-11 min-w-11 shrink-0 items-center px-3 py-2 pb-2.5 text-[13px] font-medium transition-all sm:px-3.5 sm:text-sm ${
                    active
                      ? "text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                  {tab.count >= 0 && (
                    <span
                      aria-hidden="true"
                      className={`ml-1 text-[10px] tabular-nums sm:ml-1.5 sm:text-[11px] ${
                        active ? "text-indigo-400" : "text-gray-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {active && (
                    <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-gradient-to-r from-indigo-500/60 via-indigo-500 to-indigo-500/60 rounded-full" />
                  )}
                </button>
              );
            })}
            <div aria-hidden className="shrink-0 w-10 sm:hidden" />
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0a0e1a] to-transparent sm:hidden" />
        </div>
      </div>
    </nav>
  );
}
