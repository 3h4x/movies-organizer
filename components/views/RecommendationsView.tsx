"use client";
// tamtam inspected 2026-05-21
import { useMemo } from "react";
import CardActionStack from "@/components/CardActionStack";
import MovieCard from "@/components/MovieCard";
import {
  CARD_ACTION_ICON_SIZE_CLASS,
  CARD_ACTION_TOUCH_TARGET_CLASS,
} from "@/components/card-action-styles";
import EmptyState from "@/components/ui/EmptyState";
import RecommendationRow from "@/components/RecommendationRow";
import RecommendationSkeleton from "@/components/RecommendationSkeleton";
import { getUniqueRecommendations } from "@/lib/utils";
import type { RecommendationGroup, RecType } from "@/lib/types";
import { REC_CATEGORIES } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";
import { MOOD_PRESETS, MOOD_KEYS, type MoodKey } from "@/lib/mood-presets";
import type { useRecommendations } from "@/lib/hooks/useRecommendations";

type RecsState = ReturnType<typeof useRecommendations>;

const LIKED_ACTION_CLASS = `bg-green-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-green-500 transition-colors`;
const WATCHED_ACTION_CLASS = `bg-gray-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-gray-500 transition-colors`;
const WISHLIST_ACTION_CLASS = `bg-blue-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-blue-500 transition-colors`;
const DISLIKED_ACTION_CLASS = `bg-orange-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-orange-500 transition-colors`;
const DISMISS_ACTION_CLASS = `bg-red-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-red-500 transition-colors`;

function formatRefreshTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `yesterday at ${date.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RecommendationsViewProps {
  recs: RecsState;
  hasMovies: boolean;
  disabledEngines: string[];
  invalidMoodKey: string | null;
  clearInvalidMood: () => void;
}

export default function RecommendationsView({
  recs,
  hasMovies,
  disabledEngines,
  invalidMoodKey,
  clearInvalidMood,
}: RecommendationsViewProps) {
  const {
    recsLoading,
    recommendations,
    moodGroups,
    moodLoading,
    moodError,
    recCategory,
    activeMood,
    groupOrder,
    setGroupOrder,
    categoryCounts,
    lastRecsRefresh,
    engineDropdownOpen,
    setEngineDropdownOpen,
    moodDropdownOpen,
    setMoodDropdownOpen,
    setRecCategory,
    setActiveMood,
    refreshRecs,
    handleRecAction,
    handleRecClick,
  } = recs;

  const moodPicks = useMemo(() => {
    return getUniqueRecommendations(moodGroups);
  }, [moodGroups]);

  const allRecommendations = useMemo(() => {
    return getUniqueRecommendations(recommendations);
  }, [recommendations]);

  function findRecommendationEngine(tmdbId: number): RecType | undefined {
    return recommendations.find((group) =>
      group.recommendations.some((recommendation) => recommendation.tmdb_id === tmdbId),
    )?.type;
  }

  if (!hasMovies) {
    return (
      <EmptyState
        icon="💡"
        message="No recommendations yet"
        subtext="Add some movies to your library first"
      />
    );
  }

  function recActionButtons(
    r: TmdbSearchResult,
    fromMood = false,
    engine = fromMood ? ("mood" as RecType) : findRecommendationEngine(r.tmdb_id),
  ) {
    return (
      <CardActionStack
        actions={[
          {
            key: "liked",
            label: "Watched & liked",
            icon: "👍",
            className: LIKED_ACTION_CLASS,
            onClick: () => handleRecAction(r.tmdb_id, "liked", r, fromMood, engine),
          },
          {
            key: "watched",
            label: "Watched",
            icon: "👁",
            className: WATCHED_ACTION_CLASS,
            onClick: () => handleRecAction(r.tmdb_id, "watched", r, fromMood, engine),
          },
          {
            key: "wishlist",
            label: "Add to watchlist",
            icon: "🔖",
            className: WISHLIST_ACTION_CLASS,
            onClick: () => handleRecAction(r.tmdb_id, "wishlist", r, fromMood, engine),
          },
          {
            key: "disliked",
            label: "Watched & disliked",
            icon: "👎",
            className: DISLIKED_ACTION_CLASS,
            onClick: () => handleRecAction(r.tmdb_id, "disliked", r, fromMood, engine),
          },
          {
            key: "dismiss",
            label: "Don't show again",
            icon: "✕",
            className: DISMISS_ACTION_CLASS,
            onClick: () => handleRecAction(r.tmdb_id, "dismiss", r, fromMood, engine),
          },
        ]}
      />
    );
  }

  return (
    <>
      {(engineDropdownOpen || moodDropdownOpen) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setEngineDropdownOpen(false);
            setMoodDropdownOpen(false);
          }}
        />
      )}

      {/* Filter row */}
      <div className="relative z-30 mb-4 flex flex-wrap items-start gap-2 sm:items-center">
        {/* Engine dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setEngineDropdownOpen(!engineDropdownOpen);
              setMoodDropdownOpen(false);
            }}
            className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all ${!activeMood ? "bg-gray-700/80 border-gray-600 text-white" : "bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:border-gray-600"}`}
          >
            <span>{activeMood ? "Engine" : (REC_CATEGORIES.find((c) => c.value === recCategory)?.label ?? "All")}</span>
            {!activeMood && categoryCounts[recCategory] != null && (
              <span className="tabular-nums text-gray-400">{categoryCounts[recCategory]}</span>
            )}
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {engineDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[180px]">
              {REC_CATEGORIES.filter((cat) => cat.value === "all" || !disabledEngines.includes(cat.value)).map((cat) => (
                <button key={cat.value} onClick={() => { clearInvalidMood(); setRecCategory(cat.value); setActiveMood(null); setEngineDropdownOpen(false); }}
                  className={`flex min-h-11 w-full items-center justify-between px-3 py-2 text-xs font-medium transition-all ${!activeMood && recCategory === cat.value ? "text-white bg-gray-700/60" : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/30"}`}>
                  <span>{cat.label}</span>
                  {categoryCounts[cat.value] != null && <span className="tabular-nums text-gray-600 ml-3">{categoryCounts[cat.value]}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mood dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setMoodDropdownOpen(!moodDropdownOpen);
              setEngineDropdownOpen(false);
            }}
            className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all ${activeMood ? "bg-indigo-600/80 border-indigo-500/60 text-white" : "bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:border-gray-600"}`}
          >
            {activeMood ? (<><span>{MOOD_PRESETS[activeMood].icon}</span><span>{MOOD_PRESETS[activeMood].label}</span></>) : <span>Mood</span>}
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {moodDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[180px]">
              {activeMood && (
                <>
                  <button onClick={() => { clearInvalidMood(); setActiveMood(null); setMoodDropdownOpen(false); }} className="flex min-h-11 w-full items-center px-3 py-2 text-xs font-medium text-gray-500 transition-all hover:bg-gray-700/30 hover:text-gray-200">Clear mood</button>
                  <div className="h-px bg-gray-700/60 mx-2 my-1" />
                </>
              )}
              {MOOD_KEYS.map((key) => {
                const preset = MOOD_PRESETS[key];
                return (
                  <button key={key} onClick={() => { clearInvalidMood(); setActiveMood(key); setMoodDropdownOpen(false); }}
                    className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-all ${activeMood === key ? "text-white bg-indigo-600/40" : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/30"}`}>
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {lastRecsRefresh && (
            <span className="text-gray-600 text-xs hidden sm:inline">refreshed {formatRefreshTime(lastRecsRefresh)}</span>
          )}
          <button
            onClick={refreshRecs}
            type="button"
            aria-label="Refresh recommendations"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-all hover:bg-gray-800/60 hover:text-white"
            title="Refresh recommendations"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {invalidMoodKey ? (
        <EmptyState
          className="mx-auto max-w-xl"
          icon="🧭"
          message="Unknown mood preset"
          subtext={
            <span className="break-words">
              <span className="text-gray-500">{`"${invalidMoodKey}" isn't available in this build.`}</span>{" "}
              Choose one from the Mood menu.
            </span>
          }
        />
      ) : activeMood ? (
        moodLoading ? (
          <RecommendationSkeleton />
        ) : moodError ? (
          <EmptyState icon="⚠️" message="Failed to load mood picks" subtext={moodError} />
        ) : moodGroups.length === 0 ? (
          <EmptyState
            icon={MOOD_PRESETS[activeMood].icon}
            message="No results for this mood"
            subtext="Try adding more movies or select a different mood"
          />
        ) : (
          <div>
            <p className="text-gray-500 text-xs mb-3">{MOOD_PRESETS[activeMood].reason} — {moodPicks.length} {moodPicks.length === 1 ? "pick" : "picks"}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {moodPicks.map((r) => (
                <div key={r.tmdb_id} className="relative group/rec">
                  <MovieCard title={r.title} year={r.year} genre={r.genre} rating={r.rating} userRating={null} posterUrl={r.poster_url} source="tmdb" cdaUrl={r.cda_url} onClick={() => handleRecClick(r, "mood")} />
                  {recActionButtons(r, true)}
                </div>
              ))}
            </div>
          </div>
        )
      ) : recsLoading ? (
        <RecommendationSkeleton />
      ) : recommendations.length === 0 ? (
        <EmptyState
          icon="🔍"
          message="No recommendations found"
          subtext="Try adding more movies to improve suggestions"
        />
      ) : recCategory === "all" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {allRecommendations.map((r) => (
            <div key={r.tmdb_id} className="relative group/rec">
              <MovieCard title={r.title} year={r.year} genre={r.genre} rating={r.rating} userRating={null} posterUrl={r.poster_url} source="tmdb" cdaUrl={r.cda_url} onClick={() => handleRecClick(r, findRecommendationEngine(r.tmdb_id))} />
              {recActionButtons(r)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const sorted = recommendations.filter((g) => g.type === recCategory).sort((a, b) => {
              const ai = groupOrder.indexOf(a.reason);
              const bi = groupOrder.indexOf(b.reason);
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
            return sorted.map((group, i) => (
              <RecommendationRow
                key={group.reason}
                reason={group.reason}
                type={group.type}
                recommendations={group.recommendations}
                onAction={(tmdbId, action, rec, fromMood, engine) =>
                  handleRecAction(tmdbId, action, rec, fromMood, engine)
                }
                isFirst={i === 0}
                isLast={i === sorted.length - 1}
                onMoveUp={() => {
                  const order = sorted.map((g) => g.reason);
                  const idx = order.indexOf(group.reason);
                  if (idx > 0) [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                  setGroupOrder(order);
                  fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rec_group_order: order }) });
                }}
                onMoveDown={() => {
                  const order = sorted.map((g) => g.reason);
                  const idx = order.indexOf(group.reason);
                  if (idx < order.length - 1) [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
                  setGroupOrder(order);
                  fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rec_group_order: order }) });
                }}
                onClickMovie={handleRecClick}
              />
            ));
          })()}
        </div>
      )}
    </>
  );
}
