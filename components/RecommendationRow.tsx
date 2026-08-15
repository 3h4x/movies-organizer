"use client";

import CardActionStack from "./CardActionStack";
import MovieCard from "./MovieCard";
import {
  CARD_ACTION_ICON_SIZE_CLASS,
  CARD_ACTION_TOUCH_TARGET_CLASS,
} from "./card-action-styles";
import type { RecType } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

export type RecAction =
  | "liked"
  | "watched"
  | "disliked"
  | "dismiss"
  | "wishlist";

interface RecommendationRowProps {
  reason: string;
  type: RecType;
  recommendations: TmdbSearchResult[];
  onAction: (
    tmdbId: number,
    action: RecAction,
    rec: TmdbSearchResult,
    fromMood?: boolean,
    engine?: RecType,
  ) => void;
  onClickMovie: (rec: TmdbSearchResult, engine?: RecType) => void | Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  ai: "✨",
  genre: "🎭",
  director: "🎬",
  actor: "⭐",
  movie: "💡",
  hidden_gem: "💎",
  star_studded: "🌟",
  random: "🎲",
};

const ACTION_BUTTON_BASE = `backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center transition-colors`;
const ACTION_LIKED_CLASS = `bg-green-600/90 ${ACTION_BUTTON_BASE} hover:bg-green-500`;
const ACTION_WATCHED_CLASS = `bg-gray-600/90 ${ACTION_BUTTON_BASE} hover:bg-gray-500`;
const ACTION_WISHLIST_CLASS = `bg-blue-600/90 ${ACTION_BUTTON_BASE} hover:bg-blue-500`;
const ACTION_DISLIKED_CLASS = `bg-orange-600/90 ${ACTION_BUTTON_BASE} hover:bg-orange-500`;
const ACTION_DISMISS_CLASS = `bg-red-600/90 ${ACTION_BUTTON_BASE} hover:bg-red-500`;

const REORDER_BUTTON_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800/80 bg-gray-900/70 transition-colors sm:h-8 sm:w-8 sm:border-transparent sm:bg-transparent";

function formatTraceValue(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

export default function RecommendationRow({
  reason,
  type,
  recommendations,
  onAction,
  onClickMovie,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: RecommendationRowProps) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex flex-col -my-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className={`${REORDER_BUTTON_CLASS} ${isFirst ? "cursor-default text-gray-700" : "text-gray-500 hover:bg-gray-800/80 hover:text-white"}`}
            title="Move up"
          >
            <svg
              className="h-4 w-4 sm:h-3.5 sm:w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className={`${REORDER_BUTTON_CLASS} ${isLast ? "cursor-default text-gray-700" : "text-gray-500 hover:bg-gray-800/80 hover:text-white"}`}
            title="Move down"
          >
            <svg
              className="h-4 w-4 sm:h-3.5 sm:w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
        <div className="w-1 h-5 bg-indigo-500 rounded-full" />
        <span className="text-base">{TYPE_ICONS[type] || "💡"}</span>
        <h3 className="text-white font-semibold text-base">{reason}</h3>
        <span className="text-gray-600 text-xs">
          {recommendations.length} titles
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {recommendations.map((r) => (
          <div key={r.tmdb_id} className="relative group/rec">
            <MovieCard
              title={r.title}
              year={r.year}
              genre={r.genre}
              rating={r.rating}
              userRating={null}
              posterUrl={r.poster_url}
              source="tmdb"
              cdaUrl={r.cda_url}
              onClick={() => onClickMovie(r, type)}
            />
            {r.reason ? (
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-400">
                {r.reason}
              </p>
            ) : null}
            {r.trace ? (
              <details className="absolute right-2 top-2 z-20 max-w-[calc(100%-1rem)]">
                <summary className="cursor-pointer list-none rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-200 backdrop-blur-sm">
                  Trace
                </summary>
                <div className="mt-1 rounded-lg border border-cyan-500/30 bg-black/90 p-2 text-[11px] text-cyan-50 shadow-xl">
                  <div><span className="text-cyan-300">engine:</span> {r.trace.engine}</div>
                  <div><span className="text-cyan-300">source:</span> {r.trace.source}</div>
                  {formatTraceValue(r.trace.seedKind) ? (
                    <div><span className="text-cyan-300">seed:</span> {formatTraceValue(r.trace.seedKind)}</div>
                  ) : null}
                  {formatTraceValue(r.trace.seedName ?? r.trace.seedTitle) ? (
                    <div><span className="text-cyan-300">label:</span> {formatTraceValue(r.trace.seedName ?? r.trace.seedTitle)}</div>
                  ) : null}
                  {formatTraceValue(r.trace.seedId ?? r.trace.seedTmdbId) ? (
                    <div><span className="text-cyan-300">id:</span> {formatTraceValue(r.trace.seedId ?? r.trace.seedTmdbId)}</div>
                  ) : null}
                </div>
              </details>
            ) : null}
            <CardActionStack
              actions={[
                {
                  key: "liked",
                  label: "Watched & liked",
                  icon: "👍",
                  className: ACTION_LIKED_CLASS,
                  onClick: () => onAction(r.tmdb_id, "liked", r, false, type),
                },
                {
                  key: "watched",
                  label: "Watched",
                  icon: "👁",
                  className: ACTION_WATCHED_CLASS,
                  onClick: () => onAction(r.tmdb_id, "watched", r, false, type),
                },
                {
                  key: "wishlist",
                  label: "Add to watchlist",
                  icon: "🔖",
                  className: ACTION_WISHLIST_CLASS,
                  onClick: () => onAction(r.tmdb_id, "wishlist", r, false, type),
                },
                {
                  key: "disliked",
                  label: "Watched & disliked",
                  icon: "👎",
                  className: ACTION_DISLIKED_CLASS,
                  onClick: () => onAction(r.tmdb_id, "disliked", r, false, type),
                },
                {
                  key: "dismiss",
                  label: "Don't show again",
                  icon: "✕",
                  className: ACTION_DISMISS_CLASS,
                  onClick: () => onAction(r.tmdb_id, "dismiss", r, false, type),
                },
              ]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
