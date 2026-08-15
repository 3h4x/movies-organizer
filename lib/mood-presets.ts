// tamtam inspected 2026-05-21
export interface MoodPreset {
  label: string;
  icon: string;
  reason: string;
  genreIds?: number[];
  minRating?: number;
  minVotes?: number;
  maxRuntime?: number;
  languages?: string[];
  comfortRewatch?: boolean;
}

const moodPresets = {
  light_funny: {
    label: "Light & Funny",
    icon: "😄",
    reason: "Light & funny tonight",
    genreIds: [35, 10751],
    minRating: 6.5,
    minVotes: 200,
  },
  mind_bender: {
    label: "Mind-bender",
    icon: "🤯",
    reason: "Something to mess with your head",
    genreIds: [878, 9648, 53],
    minRating: 7.5,
    minVotes: 300,
  },
  comfort_rewatch: {
    label: "Comfort Rewatch",
    icon: "🛋️",
    reason: "Comfort picks from your library",
    comfortRewatch: true,
  },
  action_evening: {
    label: "Action Evening",
    icon: "💥",
    reason: "High-energy action for tonight",
    genreIds: [28, 53, 12],
    minRating: 6.8,
    minVotes: 300,
  },
  date_night: {
    label: "Date Night",
    icon: "🌹",
    reason: "Perfect for date night",
    genreIds: [10749, 35],
    minRating: 7,
    minVotes: 300,
  },
  discover_hidden: {
    label: "Discover Hidden",
    icon: "🔦",
    reason: "Under-the-radar discoveries",
    genreIds: [18, 53, 9648],
    minRating: 7.2,
    minVotes: 80,
  },
  documentary_night: {
    label: "Documentary Night",
    icon: "🎞️",
    reason: "A strong documentary pick",
    genreIds: [99],
    minRating: 7,
    minVotes: 100,
  },
  dark_heavy: {
    label: "Dark & Heavy",
    icon: "🌑",
    reason: "Dark and intense",
    genreIds: [18, 80, 10752],
    minRating: 7.5,
    minVotes: 500,
  },
  short: {
    label: "Short (<100min)",
    icon: "⚡",
    reason: "Short films under 100 minutes",
    genreIds: [35, 28, 16],
    minRating: 7,
    minVotes: 200,
    maxRuntime: 100,
  },
  foreign: {
    label: "Foreign",
    icon: "🌍",
    reason: "World cinema picks",
    languages: ["fr", "ja", "ko", "es", "it"],
    minRating: 7.5,
    minVotes: 300,
  },
  feel_good: {
    label: "Feel-good",
    icon: "🌟",
    reason: "Movies that leave you smiling",
    genreIds: [16, 10751, 35],
    minRating: 7,
    minVotes: 300,
  },
  horror_night: {
    label: "Horror Night",
    icon: "🩸",
    reason: "Straight-up horror for tonight",
    genreIds: [27],
    minRating: 6.3,
    minVotes: 200,
  },
  horror_psychological: {
    label: "Psychological Horror",
    icon: "🧠",
    reason: "Unsettling psychological horror",
    genreIds: [27, 9648, 53],
    minRating: 6.8,
    minVotes: 200,
  },
  horror_creature: {
    label: "Creature Feature",
    icon: "👹",
    reason: "Monsters, creatures, and survival",
    genreIds: [27, 878, 12],
    minRating: 6.1,
    minVotes: 150,
  },
  horror_comedy: {
    label: "Horror Comedy",
    icon: "🪓",
    reason: "Scary, weird, and a little fun",
    genreIds: [27, 35],
    minRating: 6.2,
    minVotes: 150,
  },
  crime_thriller: {
    label: "Crime Thriller",
    icon: "🕵️",
    reason: "Tense crime and thriller picks",
    genreIds: [80, 53, 9648],
    minRating: 7,
    minVotes: 250,
  },
  animated_escape: {
    label: "Animated Escape",
    icon: "🎨",
    reason: "Animation beyond the usual comfort picks",
    genreIds: [16, 12, 14],
    minRating: 7,
    minVotes: 150,
  },
} satisfies Record<string, MoodPreset>;

export type MoodKey = keyof typeof moodPresets;

export const MOOD_PRESETS: Record<MoodKey, MoodPreset> = moodPresets;

export const MOOD_KEYS = Object.keys(MOOD_PRESETS) as MoodKey[];
