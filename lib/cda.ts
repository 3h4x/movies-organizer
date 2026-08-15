const CDA_BASE = "https://www.cda.pl";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CDA_MOVIE_SLIDE_RE =
  /<li class="mb-slide" title="([^"]*)">\s*<a href="([^"]*vfilm)">\s*<img[^>]*src="([^"]*)"/g;

export interface CdaMovie {
  title: string;
  year: number | null;
  url: string;
  poster_url: string | null;
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

function extractMovies(html: string): CdaMovie[] {
  const movies: CdaMovie[] = [];
  const seen = new Set<string>();

  CDA_MOVIE_SLIDE_RE.lastIndex = 0;
  let match;

  while ((match = CDA_MOVIE_SLIDE_RE.exec(html)) !== null) {
    const rawTitle = match[1];
    const url = match[2].startsWith("http")
      ? match[2]
      : `${CDA_BASE}${match[2]}`;
    const posterUrl = match[3];
    const { title, year } = parseTitle(rawTitle);

    if (title && !seen.has(url)) {
      seen.add(url);
      movies.push({ title, year, url, poster_url: posterUrl });
    }
  }

  return movies;
}

async function fetchPage(path: string): Promise<string> {
  const url = path.startsWith("http") ? path : `${CDA_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) return "";
  return res.text();
}

export async function scrapeCdaPremium(): Promise<CdaMovie[]> {
  const html = await fetchPage("/premium");
  return extractMovies(html);
}

export async function scrapeCdaCollection(
  collectionPath: string,
): Promise<CdaMovie[]> {
  const html = await fetchPage(collectionPath);
  return extractMovies(html);
}
