// tamtam inspected 2026-05-21
import type { Movie } from "@/lib/types";

export type QuickRateAction =
  | { kind: "rate"; rating: number }
  | { kind: "skip" }
  | { kind: "wishlist" }
  | { kind: "dismiss" }
  | { kind: "exit" };

export function isUnratedMovie(movie: Movie) {
  return movie.user_rating == null || movie.user_rating === 0;
}

export function nextUnratedMovie(
  movies: Movie[],
  currentId: number | null,
): Movie | null {
  let firstUnratedMovie: Movie | null = null;
  let returnNextUnrated = currentId == null;
  let foundCurrentMovie = false;

  for (const movie of movies) {
    if (!isUnratedMovie(movie)) continue;

    firstUnratedMovie ??= movie;
    if (returnNextUnrated) return movie;
    if (movie.id === currentId) {
      foundCurrentMovie = true;
      returnNextUnrated = true;
    }
  }

  return foundCurrentMovie ? null : firstUnratedMovie;
}

export function mapQuickRateKey(key: string): QuickRateAction | null {
  if (key >= "1" && key <= "9") {
    return { kind: "rate", rating: Number(key) };
  }
  if (key === "0") {
    return { kind: "rate", rating: 10 };
  }

  switch (key.toLowerCase()) {
    case "s":
      return { kind: "skip" };
    case "w":
      return { kind: "wishlist" };
    case "d":
      return { kind: "dismiss" };
    case "escape":
      return { kind: "exit" };
    default:
      return null;
  }
}
