import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { refreshStaleTmdbMetadata } from "@/lib/tmdb-refresh";

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_DELAY_MS = 250;

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export async function POST(request: NextRequest) {
  const mutationLimited = rateLimit(request, "mutation");
  if (mutationLimited) return mutationLimited;
  const tmdbLimited = rateLimit(request, "tmdb");
  if (tmdbLimited) return tmdbLimited;

  const db = getDb();
  const body = (await request.json().catch(() => ({}))) as {
    limit?: unknown;
    maxAgeDays?: unknown;
    delayMs?: unknown;
  };

  const options = {
    limit: boundedInteger(body.limit, DEFAULT_LIMIT, 1, 100),
    maxAgeDays: boundedInteger(body.maxAgeDays, DEFAULT_MAX_AGE_DAYS, 1, 3650),
    delayMs: boundedInteger(body.delayMs, DEFAULT_DELAY_MS, 0, 5000),
  };

  try {
    const result = await refreshStaleTmdbMetadata(db, options);
    return Response.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("TMDB_API_KEY not set") || error.message.includes("tmdb_api_error"))
    ) {
      return Response.json({ error: "TMDb is unavailable" }, { status: 503 });
    }
    console.error("[movies.refresh-stale] Failed to refresh stale metadata", error);
    return Response.json({ error: "Failed to refresh stale metadata" }, { status: 500 });
  }
}
