// tamtam inspected 2026-05-21
import type Database from "better-sqlite3";
import { searchTmdbPl } from "@/lib/tmdb";

const CDA_BASE = "https://www.cda.pl";
const CDA_FETCH_TIMEOUT_MS = 30000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PREMIUM_MOVIE_RE =
  /<li class="mb-slide" title="([^"]*)">\s*<a href="([^"]*vfilm)">\s*<img[^>]*src="([^"]*)"/g;
const CATEGORY_POSTER_RE =
  /<img class="cover-img" title="([^"]*)"[^>]*src="([^"]*)"/g;
const CATEGORY_TITLE_RE =
  /<a href="(https:\/\/www\.cda\.pl\/video\/[^"]*\/vfilm)" class="kino-title">([^<]*)<\/a>/g;

interface CdaMovie {
  title: string;
  year: number | null;
  url: string;
  poster_url: string | null;
  category: string;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&oacute;/g, "ó")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function parseTitle(raw: string): { title: string; year: number | null } {
  const cleaned = decodeEntities(raw)
    .replace(/\s*(Lektor|Napisy|Cały film|Dubbing)\s*PL\s*$/i, "")
    .trim();

  const yearMatch = cleaned.match(/\((\d{4})\)\s*$/);
  if (yearMatch) {
    return {
      title: cleaned.replace(/\s*\(\d{4}\)\s*$/, "").trim(),
      year: parseInt(yearMatch[1], 10),
    };
  }
  return { title: cleaned, year: null };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

async function fetchCdaHtml(
  url: string,
  context: string,
  options: { logHttpFailure?: boolean } = {},
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(CDA_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (options.logHttpFailure) {
        console.error(`[cda] Failed to fetch ${context}: ${res.status}`);
      }
      return null;
    }

    return await res.text();
  } catch (err) {
    console.error(`[cda] Failed to fetch ${context}:`, err);
    return null;
  }
}

async function scrapePremium(): Promise<CdaMovie[]> {
  const html = await fetchCdaHtml(`${CDA_BASE}/premium`, "premium page", {
    logHttpFailure: true,
  });
  if (html === null) {
    return [];
  }

  const movies: CdaMovie[] = [];
  const seen = new Set<string>();

  let match;

  PREMIUM_MOVIE_RE.lastIndex = 0;
  while ((match = PREMIUM_MOVIE_RE.exec(html)) !== null) {
    const rawTitle = match[1];
    const url = match[2].startsWith("http")
      ? match[2]
      : `${CDA_BASE}${match[2]}`;
    const posterUrl = match[3];
    const { title, year } = parseTitle(rawTitle);

    if (title && !seen.has(url)) {
      seen.add(url);
      movies.push({ title, year, url, poster_url: posterUrl, category: "Polecane" });
    }
  }

  return movies;
}

const CATEGORY_LABELS: Record<string, string> = {
  akcji: "Akcja",
  animowane: "Animowane",
  biograficzne: "Biograficzne",
  dokumentalne: "Dokumentalne",
  dramaty: "Dramaty",
  europejskie: "Europejskie",
  fantasy: "Fantasy",
  historyczne: "Historyczne",
  horror: "Horror",
  komedie: "Komedie",
  kryminalne: "Kryminalne",
  muzyczne: "Muzyczne",
  nagradzane: "Nagradzane",
  obyczajowe: "Obyczajowe",
  polskie: "Polskie",
  przygodowe: "Przygodowe",
  psychologiczne: "Psychologiczne",
  romanse: "Romanse",
  "sci-fi": "Sci-Fi",
  sensacyjne: "Sensacyjne",
  thrillery: "Thrillery",
  wojenne: "Wojenne",
  western: "Western",
};

const CATEGORIES = [
  "akcji",
  "animowane",
  "biograficzne",
  "dokumentalne",
  "dramaty",
  "europejskie",
  "fantasy",
  "historyczne",
  "horror",
  "komedie",
  "kryminalne",
  "muzyczne",
  "nagradzane",
  "obyczajowe",
  "polskie",
  "przygodowe",
  "psychologiczne",
  "romanse",
  "sci-fi",
  "sensacyjne",
  "thrillery",
  "wojenne",
  "western",
];

async function scrapeCategory(category: string): Promise<CdaMovie[]> {
  const html = await fetchCdaHtml(
    `${CDA_BASE}/premium/${category}`,
    `category ${category}`,
  );
  if (html === null) return [];

  const movies: CdaMovie[] = [];
  const seen = new Set<string>();

  const posterMap = new Map<string, string>();
  let match;
  CATEGORY_POSTER_RE.lastIndex = 0;
  while ((match = CATEGORY_POSTER_RE.exec(html)) !== null) {
    const imgTitle = decodeEntities(match[1]).trim();
    const posterUrl = match[2].startsWith("//")
      ? `https:${match[2]}`
      : match[2];
    posterMap.set(imgTitle, posterUrl);
  }

  CATEGORY_TITLE_RE.lastIndex = 0;
  while ((match = CATEGORY_TITLE_RE.exec(html)) !== null) {
    const url = match[1];
    const rawTitle = decodeEntities(match[2]).trim();

    if (rawTitle.includes("Sezon") || rawTitle.includes("serial")) continue;

    const { title, year } = parseTitle(rawTitle);

    if (title && !seen.has(url)) {
      seen.add(url);
      movies.push({
        title,
        year,
        url,
        poster_url: posterMap.get(rawTitle) || null,
        category: CATEGORY_LABELS[category] || category,
      });
    }
  }

  return movies;
}

export async function fetchAndStoreCdaMovies(db: Database.Database): Promise<void> {
  console.log("[cda] Fetching CDA Premium...");
  const premiumMovies = await scrapePremium();
  console.log(`[cda] Premium: ${premiumMovies.length} movies`);

  const allMovies: CdaMovie[] = [...premiumMovies];
  const seenUrls = new Set(premiumMovies.map((m) => m.url));

  for (const cat of CATEGORIES) {
    const catMovies = await scrapeCategory(cat);
    const label = CATEGORY_LABELS[cat] || cat;
    let added = 0;
    for (const m of catMovies) {
      if (!seenUrls.has(m.url)) {
        seenUrls.add(m.url);
        m.category = label;
        allMovies.push(m);
        added++;
      }
    }
    if (catMovies.length > 0) {
      console.log(`[cda] ${cat}: ${catMovies.length} found, ${added} new`);
    }
  }

  const movies = allMovies;
  console.log(`[cda] Total unique: ${movies.length}`);

  if (movies.length === 0) return;

  db.prepare("DELETE FROM recommended_movies WHERE engine = 'cda'").run();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url, pl_title, cda_url, description)
    VALUES (?, 'cda', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  console.log(`[cda] Enriching ${movies.length} movies with TMDb data...`);
  let enriched = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const tmdb = await searchTmdbPl(movie.title, movie.year);

    if (tmdb) {
      insertStmt.run(
        tmdb.tmdb_id,
        movie.category,
        movie.title,
        movie.year,
        tmdb.genre,
        tmdb.rating,
        tmdb.poster_url ?? movie.poster_url,
        movie.title,
        movie.url,
        tmdb.description,
      );
      enriched++;
    } else {
      const pseudoId = Math.abs(hashCode(movie.url));
      insertStmt.run(
        pseudoId,
        movie.category,
        movie.title,
        movie.year,
        null,
        0,
        movie.poster_url,
        movie.title,
        movie.url,
        null,
      );
    }

    if (i % 35 === 34) await new Promise((r) => setTimeout(r, 1000));
    if ((i + 1) % 50 === 0)
      console.log(`  [cda] ${i + 1}/${movies.length} (${enriched} enriched)`);
  }

  console.log(`[cda] Enriched ${enriched}/${movies.length} with TMDb data`);
}
