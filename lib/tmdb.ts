import { getDb, getSetting } from "@/lib/db";
import type { RecommendationTrace } from "@/lib/recommendation-trace";
import type { TmdbHealthSnapshot } from "@/lib/tmdb-health";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_REQUEST_TIMEOUT_MS = 15000;
const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

// Raw TMDb API response shapes
interface TmdbRawResult {
  id: number;
  title: string;
  original_title?: string | null;
  release_date: string | null;
  genre_ids: number[];
  vote_average: number;
  poster_path: string | null;
  popularity?: number;
}

interface TmdbRawPersonResult {
  id: number;
  name: string;
  popularity: number;
  known_for_department?: string | null;
}

interface TmdbRawMovie {
  id: number;
  title: string;
  release_date: string | null;
  genres?: { id: number; name: string }[];
  vote_average: number;
  poster_path: string | null;
  imdb_id?: string | null;
  overview?: string | null;
  belongs_to_collection?: { id: number; name: string } | null;
  credits?: {
    crew?: TmdbRawCrewMember[];
    cast?: TmdbRawCastMember[];
  };
}

interface TmdbRawCrewMember {
  id: number;
  name: string;
  job: string;
  department?: string;
}

interface TmdbRawCastMember {
  id: number;
  name: string;
  character: string;
}

// ── In-memory TTL cache ──────────────────────────────────────────────────────
// Caches per-movie lookups so that rapid repeated opens of the same detail view
// do not re-hit the TMDb API.  Only successful (ok) responses are cached.
// Error responses are not stored so transient failures don't poison the cache.

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const CACHE_TTL_MS = 3_600_000; // 1 hour

type LocalizedResult = { pl_title: string | null; description: string | null };
type DetailsResult = {
  director: string | null;
  writer: string | null;
  actors: string | null;
  tmdb_collection_id?: number | null;
  tmdb_collection_name?: string | null;
  tmdb_collection_checked?: boolean;
};

const localizedCache = new Map<number, CacheEntry<LocalizedResult>>();
const detailsCache = new Map<number, CacheEntry<DetailsResult>>();
const snapshotCache = new Map<number, CacheEntry<TmdbMovieSnapshot>>();

const tmdbHealth: TmdbHealthSnapshot = {
  processLocal: true,
  liveRequestCount: 0,
  cacheHitCount: 0,
  retryCount: 0,
  nonOkCount: 0,
  last429At: null,
  lastErrorStatus: null,
  lastErrorMessage: null,
  updatedAt: null,
  helpers: {},
};

function ensureHelperHealth(helper: string) {
  if (!tmdbHealth.helpers[helper]) {
    tmdbHealth.helpers[helper] = {
      liveRequestCount: 0,
      cacheHitCount: 0,
      retryCount: 0,
      nonOkCount: 0,
    };
  }
  return tmdbHealth.helpers[helper];
}

function touchTmdbHealth() {
  tmdbHealth.updatedAt = new Date().toISOString();
}

function recordTmdbLiveRequest(helper: string) {
  tmdbHealth.liveRequestCount += 1;
  ensureHelperHealth(helper).liveRequestCount += 1;
  touchTmdbHealth();
}

function recordTmdbCacheHit(helper: string) {
  tmdbHealth.cacheHitCount += 1;
  ensureHelperHealth(helper).cacheHitCount += 1;
  touchTmdbHealth();
}

function recordTmdbRetry(helper: string) {
  tmdbHealth.retryCount += 1;
  ensureHelperHealth(helper).retryCount += 1;
  touchTmdbHealth();
}

function recordTmdbError(helper: string, status: number | null, message: string | null) {
  tmdbHealth.nonOkCount += 1;
  ensureHelperHealth(helper).nonOkCount += 1;
  tmdbHealth.lastErrorStatus = status;
  tmdbHealth.lastErrorMessage = message;
  touchTmdbHealth();
}

function recordTmdbRateLimit() {
  tmdbHealth.last429At = new Date().toISOString();
  touchTmdbHealth();
}

function cacheHit<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() < entry.expiry;
}

/** Clears all in-memory TMDb caches.  Intended for tests only. */
export function clearTmdbCache(): void {
  localizedCache.clear();
  detailsCache.clear();
  snapshotCache.clear();
}

export function clearTmdbHealthTracker(): void {
  tmdbHealth.liveRequestCount = 0;
  tmdbHealth.cacheHitCount = 0;
  tmdbHealth.retryCount = 0;
  tmdbHealth.nonOkCount = 0;
  tmdbHealth.last429At = null;
  tmdbHealth.lastErrorStatus = null;
  tmdbHealth.lastErrorMessage = null;
  tmdbHealth.updatedAt = null;
  for (const key of Object.keys(tmdbHealth.helpers)) {
    delete tmdbHealth.helpers[key];
  }
}

export function getTmdbHealth(): TmdbHealthSnapshot {
  return {
    ...tmdbHealth,
    helpers: Object.fromEntries(
      Object.entries(tmdbHealth.helpers).map(([helper, stats]) => [helper, { ...stats }]),
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY || getDbApiKey();
  if (!key) throw new Error("TMDB_API_KEY not set — configure in Config tab or run: eval \"$(bioenv load)\"");
  return key;
}

function getDbApiKey(): string | null {
  try {
    const db = getDb();
    return getSetting(db, "tmdb_api_key");
  } catch {
    return null;
  }
}

function genreIdsToString(ids: number[]): string {
  return ids.map((id) => TMDB_GENRE_MAP[id] || "Unknown").join(", ");
}

// Reverse map: genre name → TMDb genre ID
const GENRE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)]),
);

export function genreNameToId(name: string): number | null {
  return GENRE_NAME_TO_ID[name] ?? null;
}

function mapResult(r: TmdbRawResult): TmdbSearchResult {
  return {
    title: r.title,
    year: r.release_date ? parseInt(r.release_date.substring(0, 4), 10) : null,
    genre: genreIdsToString(r.genre_ids || []),
    rating: Math.round(r.vote_average * 10) / 10,
    poster_url: r.poster_path
      ? `https://image.tmdb.org/t/p/w300${r.poster_path}`
      : null,
    tmdb_id: r.id,
    imdb_id: null,
  };
}

function getDepartmentPriority(department?: string | null): number {
  switch (department) {
    case "Acting":
      return 0;
    case "Directing":
      return 1;
    case "Writing":
      return 2;
    default:
      return 3;
  }
}

function getReleaseTimestamp(releaseDate: string | null): number {
  if (!releaseDate) return 0;
  const timestamp = Date.parse(releaseDate);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortPeopleResults(results: TmdbRawPersonResult[]): TmdbRawPersonResult[] {
  return [...results].sort((a, b) => {
    if (a.popularity !== b.popularity) {
      return b.popularity - a.popularity;
    }

    const departmentDiff =
      getDepartmentPriority(a.known_for_department) - getDepartmentPriority(b.known_for_department);
    if (departmentDiff !== 0) return departmentDiff;

    return a.name.localeCompare(b.name);
  });
}

function sortPersonFallbackMovieResults(results: TmdbRawResult[]): TmdbRawResult[] {
  return [...results].sort((a, b) => {
    if ((a.popularity || 0) !== (b.popularity || 0)) {
      return (b.popularity || 0) - (a.popularity || 0);
    }

    const releaseDiff = getReleaseTimestamp(b.release_date) - getReleaseTimestamp(a.release_date);
    if (releaseDiff !== 0) return releaseDiff;

    if (a.vote_average !== b.vote_average) {
      return b.vote_average - a.vote_average;
    }

    return a.title.localeCompare(b.title);
  });
}

export interface TmdbSearchResult {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  imdb_id: string | null;
  cda_url?: string | null;
  pl_title?: string | null;
  reason?: string;
  score?: number;
  trace?: RecommendationTrace;
}

export interface TmdbMovieSnapshot extends TmdbSearchResult {
  director: string | null;
  writer: string | null;
  actors: string | null;
  description: string | null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"`’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function creditsFromMovie(data: {
  credits?: {
    crew?: TmdbRawCrewMember[];
    cast?: TmdbRawCastMember[];
  };
}): DetailsResult {
  let director: string | null = null;
  const writers: string[] = [];
  for (const c of data.credits?.crew ?? []) {
    if (!director && c.job === "Director") director = c.name;
    if (c.job === "Screenplay" || c.job === "Writer" || c.job === "Story") {
      writers.push(c.name);
    }
  }
  const actors =
    data.credits?.cast
      ?.slice(0, 5)
      .map((c) => c.name)
      .join(", ") || null;

  return { director, writer: writers.length ? writers.join(", ") : null, actors };
}

function getSearchScore(
  query: string,
  result: TmdbRawResult,
  year?: number | null,
): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const titleVariants = [result.title, result.original_title]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText);

  let score = 0;

  for (const title of titleVariants) {
    if (title === normalizedQuery) {
      score = Math.max(score, 1_000);
      continue;
    }
    if (title.startsWith(normalizedQuery)) {
      score = Math.max(score, 700);
    } else if (title.includes(normalizedQuery)) {
      score = Math.max(score, 450);
    }

    const matchedTokens = queryTokens.filter((token) => title.includes(token)).length;
    score = Math.max(score, matchedTokens * 40);
    if (matchedTokens === queryTokens.length) {
      score = Math.max(score, 320 + matchedTokens * 10);
    }
  }

  if (year && result.release_date) {
    const resultYear = parseInt(result.release_date.substring(0, 4), 10);
    if (Number.isFinite(resultYear)) {
      score += Math.max(0, 30 - Math.abs(resultYear - year) * 10);
    }
  }

  score += Math.min(result.vote_average || 0, 10);
  return score;
}

function sortSearchResults(
  query: string,
  results: TmdbRawResult[],
  year?: number | null,
): TmdbRawResult[] {
  const scored = results.map((r) => ({ r, score: getSearchScore(query, r, year) }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;

    const aYear = a.r.release_date ? parseInt(a.r.release_date.substring(0, 4), 10) : null;
    const bYear = b.r.release_date ? parseInt(b.r.release_date.substring(0, 4), 10) : null;
    if (year && aYear && bYear && aYear !== bYear) {
      return Math.abs(aYear - year) - Math.abs(bYear - year);
    }

    if (a.r.vote_average !== b.r.vote_average) {
      return b.r.vote_average - a.r.vote_average;
    }

    return a.r.title.localeCompare(b.r.title);
  });
  return scored.map((s) => s.r);
}

// Shared pagination helper: fetch a pre-built list of URLs sequentially,
// stopping on the first non-ok response.
async function fetchDiscoverPages(
  urls: string[],
  apiKey: string,
  helper: string,
): Promise<TmdbSearchResult[]> {
  const all: TmdbSearchResult[] = [];
  for (const url of urls) {
    const res = await fetchWithRetry(url, apiKey, 0, helper);
    if (!res.ok) break;
    const data = (await res.json()) as { results?: TmdbRawResult[] };
    all.push(...(data.results || []).map(mapResult));
  }
  return all;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  retries = 3,
  helper = "unknown",
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    recordTmdbLiveRequest(helper);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(TMDB_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TMDb request failed";
      recordTmdbError(helper, null, message);
      throw error;
    }
    if (res.status === 429) {
      recordTmdbError(helper, 429, res.statusText || "Too Many Requests");
      recordTmdbRateLimit();
      if (attempt < retries) {
        recordTmdbRetry(helper);
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`[TMDb] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
    }
    if (!res.ok && res.status !== 429) {
      recordTmdbError(helper, res.status, res.statusText || "TMDb request failed");
    }
    return res;
  }
  // Should never reach here, but satisfies TypeScript
  return fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TMDB_REQUEST_TIMEOUT_MS),
  });
}

export async function searchTmdb(
  query: string,
  year?: number | null,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();

  async function searchWithYear(y: number | null | undefined) {
    let url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`;
    if (y) url += `&year=${y}`;
    const res = await fetchWithRetry(url, apiKey, 3, "searchTmdb");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[TMDb] searchTmdb failed: ${res.status} ${res.statusText}`, body);
      throw new Error(`tmdb_api_error:${res.status}`);
    }
    const data = (await res.json()) as { results?: TmdbRawResult[] };
    return sortSearchResults(query, data.results || [], y).slice(0, 10).map(mapResult);
  }

  // Try original year first
  let results = await searchWithYear(year);

  // If no match and year is provided, try +/- 1 year and then without year
  if (results.length === 0 && year) {
    results = await searchWithYear(year + 1);
    if (results.length === 0) {
      results = await searchWithYear(year - 1);
    }
    if (results.length === 0) {
      results = await searchWithYear(null);
    }
  }

  return results;
}

export async function searchTmdbForUi(query: string): Promise<TmdbSearchResult[]> {
  const movieResults = await searchTmdb(query);
  if (movieResults.length > 0) return movieResults;

  const apiKey = getApiKey();
  const peopleRes = await fetchWithRetry(
    `${TMDB_BASE}/search/person?query=${encodeURIComponent(query)}&language=en-US&page=1`,
    apiKey,
  );
  if (!peopleRes.ok) {
    const body = await peopleRes.text().catch(() => "");
    console.error(`[TMDb] searchTmdbForUi person search failed: ${peopleRes.status} ${peopleRes.statusText}`, body);
    throw new Error(`tmdb_api_error:${peopleRes.status}`);
  }

  const peopleData = (await peopleRes.json()) as { results?: TmdbRawPersonResult[] };
  const topPeople = sortPeopleResults(peopleData.results || []).slice(0, 3);
  if (topPeople.length === 0) return [];

  const dedupedMovies = new Map<number, TmdbRawResult>();
  for (const person of topPeople) {
    const creditsRes = await fetchWithRetry(
      `${TMDB_BASE}/person/${person.id}/movie_credits?language=en-US`,
      apiKey,
    );
    if (!creditsRes.ok) continue;

    const creditsData = (await creditsRes.json()) as {
      cast?: TmdbRawResult[];
      crew?: TmdbRawResult[];
    };

    for (const credit of [...(creditsData.cast || []), ...(creditsData.crew || [])]) {
      if (!credit?.id || !credit.title) continue;

      const existing = dedupedMovies.get(credit.id);
      if (!existing || (credit.popularity || 0) > (existing.popularity || 0)) {
        dedupedMovies.set(credit.id, credit);
      }
    }
  }

  return sortPersonFallbackMovieResults([...dedupedMovies.values()])
    .slice(0, 10)
    .map(mapResult);
}

export async function getMovieLocalized(
  tmdbId: number,
): Promise<{ pl_title: string | null; description: string | null }> {
  const cached = localizedCache.get(tmdbId);
  if (cacheHit(cached)) {
    recordTmdbCacheHit("getMovieLocalized");
    return cached.data;
  }

  const apiKey = getApiKey();
  const plRes = await fetchWithRetry(
    `${TMDB_BASE}/movie/${tmdbId}?language=pl-PL`,
    apiKey,
    3,
    "getMovieLocalized",
  );
  if (!plRes.ok) return { pl_title: null, description: null };
  const plData = (await plRes.json()) as { title?: string; overview?: string };

  let description = plData.overview || null;
  if (!description) {
    const enRes = await fetchWithRetry(
      `${TMDB_BASE}/movie/${tmdbId}?language=en-US`,
      apiKey,
      3,
      "getMovieLocalized",
    );
    if (enRes.ok) {
      const enData = (await enRes.json()) as { overview?: string };
      description = enData.overview || null;
    }
  }

  const result: LocalizedResult = { pl_title: plData.title || null, description };
  localizedCache.set(tmdbId, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

// Keep backward compat
export async function getPolishTitle(tmdbId: number): Promise<string | null> {
  const { pl_title } = await getMovieLocalized(tmdbId);
  return pl_title;
}

export async function getTmdbMovieDetails(
  tmdbId: number,
): Promise<DetailsResult> {
  const cached = detailsCache.get(tmdbId);
  if (cacheHit(cached)) {
    recordTmdbCacheHit("getTmdbMovieDetails");
    return cached.data;
  }

  const url = `${TMDB_BASE}/movie/${tmdbId}?append_to_response=credits`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey, 3, "getTmdbMovieDetails");

  if (!res.ok) return { director: null, writer: null, actors: null };

  const data = (await res.json()) as TmdbRawMovie;
  const collection = data.belongs_to_collection;
  const result: DetailsResult = {
    ...creditsFromMovie(data),
    tmdb_collection_checked: true,
    ...(collection
      ? {
          tmdb_collection_id: collection.id,
          tmdb_collection_name: collection.name,
        }
      : {}),
  };
  detailsCache.set(tmdbId, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function getTmdbCollectionParts(
  collectionId: number,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const res = await fetchWithRetry(
    `${TMDB_BASE}/collection/${collectionId}?language=en-US`,
    apiKey,
    3,
    "getTmdbCollectionParts",
  );

  if (!res.ok) return [];

  const data = (await res.json()) as { parts?: TmdbRawResult[] };
  return (data.parts || []).map(mapResult);
}

export async function getTmdbMovieSnapshot(
  tmdbId: number,
): Promise<TmdbMovieSnapshot | null> {
  const cached = snapshotCache.get(tmdbId);
  if (cacheHit(cached)) {
    recordTmdbCacheHit("getTmdbMovieSnapshot");
    return cached.data;
  }

  const apiKey = getApiKey();
  const res = await fetchWithRetry(
    `${TMDB_BASE}/movie/${tmdbId}?append_to_response=credits&language=en-US`,
    apiKey,
    3,
    "getTmdbMovieSnapshot",
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[TMDb] getTmdbMovieSnapshot failed: ${res.status} ${res.statusText}`, body);
    throw new Error(`tmdb_api_error:${res.status}`);
  }

  const data = (await res.json()) as TmdbRawMovie;
  const credits = creditsFromMovie(data);
  const localized = await getMovieLocalized(tmdbId);

  const result: TmdbMovieSnapshot = {
    title: data.title,
    year: data.release_date ? parseInt(data.release_date.substring(0, 4), 10) : null,
    genre: data.genres?.map((genre) => genre.name || TMDB_GENRE_MAP[genre.id] || "Unknown").join(", ") || "",
    rating: Math.round((data.vote_average || 0) * 10) / 10,
    poster_url: data.poster_path
      ? `https://image.tmdb.org/t/p/w300${data.poster_path}`
      : null,
    tmdb_id: data.id,
    imdb_id: data.imdb_id ?? null,
    pl_title: localized.pl_title,
    description: localized.description || data.overview || null,
    director: credits.director,
    writer: credits.writer,
    actors: credits.actors,
  };
  snapshotCache.set(tmdbId, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function getTmdbRecommendations(
  tmdbId: number,
): Promise<TmdbSearchResult[]> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/recommendations?language=en-US&page=1`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey, 3, "getTmdbRecommendations");

  if (!res.ok) return [];

  const data = (await res.json()) as { results?: TmdbRawResult[] };
  const results = (data.results || []).slice(0, 5);
  return results.map(mapResult);
}

export async function getTmdbSimilar(
  tmdbId: number,
): Promise<TmdbSearchResult[]> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/similar?language=en-US&page=1`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey, 3, "getTmdbSimilar");

  if (!res.ok) return [];

  const data = (await res.json()) as { results?: TmdbRawResult[] };
  return (data.results || []).slice(0, 5).map(mapResult);
}

export async function discoverByGenre(
  genreId: number,
  pages = 3,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from(
    { length: pages },
    (_, i) =>
      `${TMDB_BASE}/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=500&language=en-US&page=${i + 1}`,
  );
  return fetchDiscoverPages(urls, apiKey, "discoverByGenre");
}

export async function discoverByPerson(
  personId: number,
  pages = 2,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from(
    { length: pages },
    (_, i) =>
      `${TMDB_BASE}/discover/movie?with_people=${personId}&sort_by=vote_average.desc&vote_count.gte=50&language=en-US&page=${i + 1}`,
  );
  return fetchDiscoverPages(urls, apiKey, "discoverByPerson");
}

export interface TmdbCredit {
  id: number;
  name: string;
  job?: string;
  character?: string;
  department?: string;
}

export async function discoverHiddenGems(
  genreId?: number,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from({ length: 3 }, () => {
    const page = Math.floor(Math.random() * 10) + 1;
    let url = `${TMDB_BASE}/discover/movie?sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=500&vote_average.gte=7.5&language=en-US&page=${page}`;
    if (genreId) url += `&with_genres=${genreId}`;
    return url;
  });
  return fetchDiscoverPages(urls, apiKey, "discoverHiddenGems");
}

export async function discoverStarStudded(): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from(
    { length: 3 },
    (_, i) =>
      `${TMDB_BASE}/discover/movie?sort_by=popularity.desc&vote_count.gte=5000&vote_average.gte=7&language=en-US&page=${i + 1}`,
  );
  return fetchDiscoverPages(urls, apiKey, "discoverStarStudded");
}

export async function discoverAiCandidates(): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from(
    { length: 3 },
    (_, i) =>
      `${TMDB_BASE}/discover/movie?sort_by=vote_average.desc&vote_count.gte=500&language=en-US&page=${i + 1}`,
  );
  return fetchDiscoverPages(urls, apiKey, "discoverAiCandidates");
}

export async function discoverRandom(): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from({ length: 3 }, () => {
    const page = Math.floor(Math.random() * 20) + 1;
    return `${TMDB_BASE}/discover/movie?sort_by=popularity.desc&vote_count.gte=200&vote_average.gte=6.5&language=en-US&page=${page}`;
  });
  return shuffle(await fetchDiscoverPages(urls, apiKey, "discoverRandom"));
}

export interface MoodDiscoverParams {
  genreIds?: number[];
  minRating?: number;
  minVotes?: number;
  maxRuntime?: number;
  languages?: string[];
  pages?: number;
}

export async function discoverByMood(
  params: MoodDiscoverParams,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const {
    genreIds,
    minRating = 6.5,
    minVotes = 200,
    maxRuntime,
    languages,
    pages = 3,
  } = params;

  function buildUrl(page: number, lang?: string): string {
    let url = `${TMDB_BASE}/discover/movie?sort_by=vote_average.desc&vote_count.gte=${minVotes}&vote_average.gte=${minRating}&language=en-US&page=${page}`;
    if (genreIds?.length) url += `&with_genres=${genreIds.join(",")}`;
    if (maxRuntime) url += `&with_runtime.lte=${maxRuntime}`;
    if (lang) url += `&with_original_language=${lang}`;
    return url;
  }

  if (languages?.length) {
    const all: TmdbSearchResult[] = [];
    for (const lang of languages) {
      const urls = Array.from({ length: pages }, (_, i) =>
        buildUrl(i + 1, lang),
      );
      all.push(...(await fetchDiscoverPages(urls, apiKey, "discoverByMood")));
    }
    return shuffle(all);
  }

  const urls = Array.from({ length: pages }, (_, i) => buildUrl(i + 1));
  return shuffle(await fetchDiscoverPages(urls, apiKey, "discoverByMood"));
}

// Searches TMDb in Polish and returns data needed for CDA enrichment.
// Returns null if no API key is configured or no match is found.
export async function searchTmdbPl(
  title: string,
  year: number | null,
): Promise<{ tmdb_id: number; genre: string; rating: number; description: string | null; poster_url: string | null } | null> {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch {
    return null;
  }

  interface PlRawResult {
    id: number;
    genre_ids: number[];
    vote_average: number;
    overview: string | null;
    poster_path: string | null;
  }

  async function searchWithYear(y: number | null) {
    let url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&language=pl-PL&page=1`;
    if (y) url += `&year=${y}`;
    const res = await fetchWithRetry(url, apiKey, 3, "searchTmdbPl");
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: PlRawResult[] };
    return data.results ?? null;
  }

  let results = await searchWithYear(year);
  if ((!results || !results.length) && year) {
    results = await searchWithYear(year + 1);
    if (!results || !results.length) results = await searchWithYear(year - 1);
  }
  if (!results || !results.length) results = await searchWithYear(null);

  const match = results?.[0];
  if (!match) return null;

  // Polish-language search may return poster_path: null even when an English poster exists.
  // Fall back to the language-neutral movie details endpoint to get the primary poster.
  let posterPath = match.poster_path;
  if (!posterPath) {
    const detailRes = await fetchWithRetry(
      `${TMDB_BASE}/movie/${match.id}`,
      apiKey,
      3,
      "searchTmdbPl",
    );
    if (detailRes.ok) {
      const detail = (await detailRes.json()) as { poster_path?: string | null };
      posterPath = detail.poster_path || null;
    }
  }

  return {
    tmdb_id: match.id,
    genre: (match.genre_ids || []).map((id) => TMDB_GENRE_MAP[id] || "Unknown").join(", "),
    rating: Math.round(match.vote_average * 10) / 10,
    description: match.overview || null,
    poster_url: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null,
  };
}

export async function getMovieCredits(
  tmdbId: number,
): Promise<{ directors: TmdbCredit[]; cast: TmdbCredit[] }> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/credits`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey, 3, "getMovieCredits");
  if (!res.ok) return { directors: [], cast: [] };
  const data = (await res.json()) as {
    crew?: TmdbRawCrewMember[];
    cast?: TmdbRawCastMember[];
  };
  const directors = (data.crew || [])
    .filter((c) => c.job === "Director")
    .map((c) => ({ id: c.id, name: c.name, job: c.job }));
  const cast = (data.cast || [])
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name, character: c.character }));
  return { directors, cast };
}
