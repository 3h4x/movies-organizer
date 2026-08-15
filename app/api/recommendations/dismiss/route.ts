import { NextRequest } from "next/server";
import { getDb, dismissRecommendation, recordRecommendationEvent } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const { tmdb_id, engine = "" } = await request.json();

  if (!tmdb_id || typeof tmdb_id !== "number") {
    return Response.json({ error: "tmdb_id is required" }, { status: 400 });
  }

  const db = getDb();
  dismissRecommendation(db, tmdb_id);
  recordRecommendationEvent(db, tmdb_id, engine, "dismiss");
  return Response.json({ ok: true });
}
