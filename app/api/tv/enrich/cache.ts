// tamtam inspected 2026-05-21
export interface TvEnrichResult {
  rating: number | null;
  year: number | null;
}

const cache = new Map<string, TvEnrichResult>();

export function getTvEnrichCacheEntry(title: string): TvEnrichResult | undefined {
  return cache.get(title);
}

export function setTvEnrichCacheEntry(title: string, value: TvEnrichResult): void {
  cache.set(title, value);
}

export function clearTvEnrichCache(): void {
  cache.clear();
}
