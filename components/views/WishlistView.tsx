"use client";
// tamtam inspected 2026-05-21
import CardActionStack from "@/components/CardActionStack";
import MovieCard from "@/components/MovieCard";
import {
  CARD_ACTION_ICON_SIZE_CLASS,
  CARD_ACTION_TOUCH_TARGET_CLASS,
} from "@/components/card-action-styles";
import EmptyState from "@/components/ui/EmptyState";
import type { Movie } from "@/lib/types";

const ACTION_BASE_CLASS = `watchlist-action backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center transition-colors`;
const LIKED_CLASS = `bg-green-600/90 ${ACTION_BASE_CLASS} hover:bg-green-500`;
const WATCHED_CLASS = `bg-gray-600/90 ${ACTION_BASE_CLASS} hover:bg-gray-500`;
const DISLIKED_CLASS = `bg-orange-600/90 ${ACTION_BASE_CLASS} hover:bg-orange-500`;
const REMOVE_CLASS = `bg-red-600/90 ${ACTION_BASE_CLASS} hover:bg-red-500`;

interface WishlistViewProps {
  wishlistMovies: Movie[];
  onMovieClick: (movie: Movie) => void;
  onAction: (
    movie: Movie,
    action: "liked" | "watched" | "disliked" | "remove",
  ) => void;
}

export default function WishlistView({
  wishlistMovies,
  onMovieClick,
  onAction,
}: WishlistViewProps) {
  if (wishlistMovies.length === 0) {
    return (
      <EmptyState
        icon="🔖"
        message="Your watchlist is empty"
        subtext="Browse recommendations and bookmark films you want to watch"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {wishlistMovies.map((m) => (
        <div key={m.id} className="relative group/wish">
          <MovieCard
            title={m.title}
            year={m.year}
            genre={m.genre}
            rating={m.rating}
            userRating={m.user_rating}
            posterUrl={m.poster_url}
            source={m.source}
            onClick={() => onMovieClick(m)}
          />
          <CardActionStack
            actions={[
              {
                key: "liked",
                label: "Watched & liked",
                icon: "👍",
                className: LIKED_CLASS,
                onClick: () => onAction(m, "liked"),
              },
              {
                key: "watched",
                label: "Watched",
                icon: "👁",
                className: WATCHED_CLASS,
                onClick: () => onAction(m, "watched"),
              },
              {
                key: "disliked",
                label: "Watched & disliked",
                icon: "👎",
                className: DISLIKED_CLASS,
                onClick: () => onAction(m, "disliked"),
              },
              {
                key: "remove",
                label: "Remove from watchlist",
                icon: "✕",
                className: REMOVE_CLASS,
                onClick: () => onAction(m, "remove"),
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
