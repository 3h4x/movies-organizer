// tamtam inspected 2026-05-21
import { getTmdbHealth } from "@/lib/tmdb";

export async function GET() {
  return Response.json(getTmdbHealth());
}
