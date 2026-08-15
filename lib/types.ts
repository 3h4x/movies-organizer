// tamtam inspected 2026-05-21
import type { TmdbSearchResult } from "@/lib/tmdb";
export type {
  RecommendationSourceKind,
  RecommendationSeedKind,
  RecommendationTrace,
} from "@/lib/recommendation-trace";

export type SortOption =
  | "user_rating"
  | "rating"
  | "year"
  | "title"
  | "created_at"
  | "rated_at";

export interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  rating: number | null;
  user_rating: number | null;
  poster_url: string | null;
  source: string | null;
  imdb_id?: string | null;
  type: string;
  tmdb_id?: number | null;
  rated_at: string | null;
  created_at: string;
  filmweb_url?: string | null;
  cda_url?: string | null;
  pl_title?: string | null;
  description?: string | null;
  wishlist?: number;
  file_path?: string | null;
  tmdb_collection_id?: number | null;
  tmdb_collection_name?: string | null;
  tmdb_collection_checked?: number | null;
  tmdb_refreshed_at?: number | null;
}

export type RecType =
  | "ai"
  | "genre"
  | "director"
  | "actor"
  | "movie"
  | "franchise"
  | "hidden_gem"
  | "star_studded"
  | "random"
  | "cda"
  | "mood"
  | "watchlist";

export interface RecommendationGroup {
  reason: string;
  type: RecType;
  recommendations: TmdbSearchResult[];
}

export interface ToastItem {
  id: number;
  message: string;
  variant?: "default" | "success";
}

export type AppTab =
  | "library"
  | "recommendations"
  | "wishlist"
  | "config"
  | "person"
  | "search"
  | "tv";

export interface RecConfig {
  excluded_genres: string[];
  min_year: number | null;
  min_rating: number | null;
  max_per_group: number;
  movie_seed_min_rating?: number;
  movie_seed_count?: number;
  use_tmdb_similar?: boolean;
  actor_min_appearances?: number;
  director_min_films?: number;
  top_genre_count?: number;
}

export const PAGE_SIZE = 36;

export const REC_CATEGORIES: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "For You" },
  { value: "random", label: "Surprise Me" },
  { value: "genre", label: "By Genre" },
  { value: "actor", label: "By Actor" },
  { value: "director", label: "By Director" },
  { value: "movie", label: "Similar" },
  { value: "franchise", label: "Franchises" },
  { value: "hidden_gem", label: "Hidden Gems" },
  { value: "star_studded", label: "Star-Studded" },
  { value: "watchlist", label: "From Watchlist" },
  { value: "cda", label: "On CDA" },
];
