"use client";

import { useState } from "react";
import {
  CARD_ACTION_TOGGLE_CLASS,
  CARD_ACTION_TOUCH_TARGET_CLASS,
} from "./card-action-styles";

function getPosterMonogram(title: string) {
  const parts = title
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

interface MovieCardProps {
  title: string;
  year: number | null;
  genre: string | null;
  rating: number | null;
  userRating: number | null;
  posterUrl: string | null;
  source: string | null;
  cdaUrl?: string | null;
  onDelete?: () => void;
  onAddToWatchlist?: () => void;
  onClick?: () => void;
}

export default function MovieCard({
  title,
  year,
  genre,
  rating,
  userRating,
  posterUrl,
  source,
  cdaUrl,
  onDelete,
  onAddToWatchlist,
  onClick,
}: MovieCardProps) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const isInteractive = Boolean(onClick);

  const actionButtons = [
    onAddToWatchlist
      ? {
          key: "watchlist",
          label: "Add to Watchlist",
          className:
            `bg-indigo-500/80 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} text-sm font-bold hover:bg-indigo-400 flex items-center justify-center shadow-lg sm:text-xs`,
          icon: "+",
          onClick: onAddToWatchlist,
        }
      : null,
    onDelete
      ? {
          key: "delete",
          label: `Remove ${title}`,
          className:
            `bg-red-500/80 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} text-sm font-bold hover:bg-red-400 flex items-center justify-center shadow-lg sm:text-xs`,
          icon: "✕",
          onClick: onDelete,
        }
      : null,
  ].filter((action): action is NonNullable<typeof action> => action !== null);

  function runAction(action: (typeof actionButtons)[number]) {
    action.onClick();
    setMobileActionsOpen(false);
  }

  return (
    <div
      className={`group relative rounded-xl overflow-hidden bg-gray-800/60 backdrop-blur-sm border border-gray-700/30 hover:border-indigo-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 ${onClick ? "cursor-pointer" : ""}`}
    >
      {isInteractive && (
        <button
          type="button"
          className="absolute inset-0 z-[1] rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          aria-label={`Open ${title}`}
          onClick={onClick}
        />
      )}
      <div className="aspect-[2/3] bg-gray-800 relative overflow-hidden">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.28),_transparent_52%),linear-gradient(160deg,_rgba(15,23,42,0.96),_rgba(17,24,39,0.84))]">
            <div className="flex h-full flex-col justify-between p-4">
              <div className="self-start rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300">
                No poster
              </div>
              <div className="space-y-3">
                <div className="text-5xl font-black tracking-tight text-white/12">
                  {getPosterMonogram(title).toUpperCase()}
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold leading-tight text-white">
                    {title}
                  </p>
                  {year && <p className="text-sm text-gray-400">{year}</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {userRating != null && userRating > 0 && (
            <div className="bg-indigo-500/90 backdrop-blur-sm text-white text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1">
              ♥ {userRating}/10
            </div>
          )}
          {rating != null && rating > 0 && (
            <div className="bg-black/70 backdrop-blur-sm text-yellow-400 text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1">
              ★ {rating}
            </div>
          )}
        </div>

        {actionButtons.length > 0 && (
          <div className="absolute top-2 right-2 z-10">
            <div className="pointer-events-none hidden flex-col gap-1 opacity-0 transition-all duration-200 [@media(hover:hover)]:flex [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100">
              {actionButtons.map((action) => (
                <button
                  key={action.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    runAction(action);
                  }}
                  className={action.className}
                  title={action.label}
                  aria-label={action.label}
                >
                  {action.icon}
                </button>
              ))}
            </div>

            <div className="flex flex-col items-end gap-1 [@media(hover:hover)]:hidden">
              {mobileActionsOpen && (
                <div className="mb-1 flex flex-col gap-1 rounded-xl border border-gray-700/60 bg-gray-950/80 p-1 shadow-2xl backdrop-blur-md">
                  {actionButtons.map((action) => (
                    <button
                      key={action.key}
                      onClick={(e) => {
                        e.stopPropagation();
                        runAction(action);
                      }}
                      className={action.className}
                      title={action.label}
                      aria-label={action.label}
                    >
                      {action.icon}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileActionsOpen((open) => !open);
                }}
                className={CARD_ACTION_TOGGLE_CLASS}
                title={mobileActionsOpen ? "Hide actions" : "Show actions"}
                aria-label={mobileActionsOpen ? "Hide actions" : "Show actions"}
              >
                {mobileActionsOpen ? "✕" : "⋯"}
              </button>
            </div>
          </div>
        )}

        {/* Source + CDA badges */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          {cdaUrl && (
            <div className="text-[10px] font-medium px-2 py-0.5 bg-indigo-600/80 backdrop-blur-sm text-white rounded-md">
              CDA
            </div>
          )}
          {source && (
            <div className="text-[10px] font-medium px-2 py-0.5 bg-black/60 backdrop-blur-sm text-gray-300 rounded-md uppercase tracking-wider">
              {source}
            </div>
          )}
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-white text-sm font-semibold truncate leading-tight">
          {title}
        </h3>
        <div className="flex items-center gap-2 mt-1.5">
          {year && <span className="text-gray-500 text-xs">{year}</span>}
          {genre && (
            <>
              <span className="text-gray-700 text-xs">·</span>
              <span className="text-gray-500 text-xs truncate">{genre}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
