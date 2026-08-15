// tamtam inspected 2026-05-21

// 1x1 transparent gif so MovieCard's poster-less fallback (which also renders
// the title as a <p>) doesn't trigger and duplicate text content under
// strict-mode locators.
export const MOCK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const MOCK_MOVIES = [
  {
    id: 1,
    title: "The Godfather",
    year: 1972,
    genre: "Crime, Drama",
    director: "Francis Ford Coppola",
    writer: "Mario Puzo",
    actors: "Marlon Brando, Al Pacino",
    rating: 9.2,
    user_rating: 10,
    poster_url: MOCK_POSTER,
    source: "tmdb",
    type: "movie",
    tmdb_id: 238,
    rated_at: "2024-01-01T00:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    filmweb_url: null,
    cda_url: null,
    pl_title: "Ojciec Chrzestny",
    wishlist: 0,
    file_path: null,
  },
  {
    id: 2,
    title: "Blade Runner 2049",
    year: 2017,
    genre: "Science Fiction, Drama",
    director: "Denis Villeneuve",
    writer: "Hampton Fancher",
    actors: "Ryan Gosling, Harrison Ford",
    rating: 8.0,
    user_rating: 8,
    poster_url: MOCK_POSTER,
    source: "filmweb",
    type: "movie",
    tmdb_id: 335984,
    rated_at: "2024-02-01T00:00:00Z",
    created_at: "2024-02-01T00:00:00Z",
    filmweb_url: null,
    cda_url: null,
    pl_title: null,
    wishlist: 0,
    file_path: null,
  },
];

export const MOCK_SETTINGS = {
  library_path: null,
  tmdb_api_key_source: "env" as const,
  disabled_engines: [],
  rec_group_order: [],
  rec_config: {
    excluded_genres: [],
    min_year: null,
    min_rating: null,
    max_per_group: 15,
    movie_seed_min_rating: 7,
    movie_seed_count: 10,
    use_tmdb_similar: true,
    actor_min_appearances: 2,
    director_min_films: 2,
  },
};

export const MOCK_RECS = [
  {
    reason: "Because you like Crime films",
    type: "genre",
    recommendations: [
      {
        tmdb_id: 769,
        title: "GoodFellas",
        year: 1990,
        genre: "Crime, Drama",
        rating: 8.7,
        poster_url: MOCK_POSTER,
      },
    ],
  },
];
