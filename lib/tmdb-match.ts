import type { TmdbSearchResult } from "@/lib/tmdb";
import { cleanTitle } from "@/lib/utils";

function normalizeTitle(title: string): string {
  return cleanTitle(title).toLowerCase();
}

export function selectTmdbSearchCandidates(
  results: TmdbSearchResult[],
  parsedTitle: string,
  parsedYear: number | null,
): {
  strongMatch: TmdbSearchResult | null;
  fallbackMatch: TmdbSearchResult | null;
} {
  const normalizedParsedTitle = normalizeTitle(parsedTitle);

  const strongMatch =
    results.find((result) => {
      if (normalizeTitle(result.title) !== normalizedParsedTitle) {
        return false;
      }
      if (parsedYear != null) {
        if (result.year == null) {
          return false;
        }
        return Math.abs(result.year - parsedYear) <= 1;
      }
      return true;
    }) ?? null;

  return {
    strongMatch,
    fallbackMatch: results[0] ?? null,
  };
}
