import { getTmdbCollectionParts } from "../tmdb";
import type { TmdbSearchResult } from "../tmdb";
import {
  attachTrace,
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

interface CollectionSeed {
  id: number;
  name: string;
}

export async function franchiseEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const collections = new Map<number, CollectionSeed>();
  for (const movie of ctx.library) {
    if (!movie.tmdb_collection_id || !movie.tmdb_collection_name) continue;
    collections.set(movie.tmdb_collection_id, {
      id: movie.tmdb_collection_id,
      name: movie.tmdb_collection_name,
    });
  }

  if (collections.size === 0) return [];

  const groups: RecommendationGroup[] = [];
  for (const collection of collections.values()) {
    let parts: TmdbSearchResult[];
    try {
      parts = await getTmdbCollectionParts(collection.id);
    } catch {
      continue;
    }
    const filtered = filterResults(parts, ctx);
    if (filtered.length === 0) continue;
    groups.push({
      reason: `Complete ${collection.name}`,
      type: "franchise",
      recommendations: attachTrace(filtered, {
        engine: "franchise",
        seedKind: "franchise",
        seedId: collection.id,
        seedName: collection.name,
      }),
    });
  }

  return groups;
}
