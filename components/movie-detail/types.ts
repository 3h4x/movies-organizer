export interface VideoAudioTrack {
  codec: string;
  channels: number;
  language?: string;
}

export interface VideoMetadata {
  error?: string;
  size?: number;
  bitrate?: number;
  video?: {
    width?: number;
    height?: number;
    codec?: string;
  };
  audio?: VideoAudioTrack[];
}

export interface MovieDetailMovie {
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
  type: string;
  tmdb_id?: number | null;
  imdb_id?: string | null;
  filmweb_url?: string | null;
  cda_url?: string | null;
  pl_title?: string | null;
  description?: string | null;
  rated_at: string | null;
  created_at: string;
  file_path?: string | null;
  extra_files?: string | null;
  video_metadata?: string | null;
}

export interface PersonRating {
  avg_rating: number;
  movie_count: number;
}

export interface SubtitleTrack {
  name: string;
  path: string;
}

export interface StandardizeMessage {
  type: "success" | "error";
  text: string;
  code?: string;
}
