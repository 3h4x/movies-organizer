// tamtam inspected 2026-05-21
import { searchTmdb } from "@/lib/tmdb";
import {
  getTvEnrichCacheEntry,
  setTvEnrichCacheEntry,
  type TvEnrichResult,
} from "@/app/api/tv/enrich/cache";
import { rateLimit } from "@/lib/rate-limit";

const TV_ENRICH_BATCH_SIZE = 8;

export async function POST(request: Request) {
  const limited = rateLimit(request, "tmdb");
  if (limited) return limited;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "request body must be valid JSON" }, { status: 400 });
  }

  try {
    const { titles } = body as { titles: unknown };

    if (!Array.isArray(titles)) {
      return Response.json({ error: "titles must be an array" }, { status: 400 });
    }
    if (titles.length > 500) {
      return Response.json({ error: "too many titles (max 500)" }, { status: 400 });
    }
    if (titles.some((t) => typeof t !== "string")) {
      return Response.json({ error: "all titles must be strings" }, { status: 400 });
    }

    const result: Record<string, TvEnrichResult> = {};

    for (let index = 0; index < titles.length; index += TV_ENRICH_BATCH_SIZE) {
      const batch = titles.slice(index, index + TV_ENRICH_BATCH_SIZE);
      await Promise.all(batch.map(async (rawTitle: string) => {
        const title = rawTitle.trim();
        if (!title) {
          result[rawTitle] = { rating: null, year: null };
          return;
        }

        const cached = getTvEnrichCacheEntry(title);
        if (cached) {
          result[rawTitle] = cached;
          return;
        }

        try {
          const hits = await searchTmdb(title);
          const top = hits[0];
          const data: TvEnrichResult = top
            ? {
                rating: top.rating ?? null,
                year: top.year ?? null,
              }
            : { rating: null, year: null };
          setTvEnrichCacheEntry(title, data);
          result[rawTitle] = data;
        } catch (error) {
          console.error("[TV enrich] Failed to enrich title", { title, error });
          result[rawTitle] = { rating: null, year: null };
        }
      }));
    }

    return Response.json(result);
  } catch (error) {
    console.error("[TV enrich] Unexpected route failure", error);
    return Response.json({ error: "Failed to enrich TV movies" }, { status: 500 });
  }
}
