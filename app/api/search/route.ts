import { NextRequest } from "next/server";
import { searchTmdbForUi } from "@/lib/tmdb";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "tmdb");
  if (limited) return limited;
  const query = request.nextUrl.searchParams.get("q") || "";

  if (!query.trim()) {
    return Response.json([]);
  }

  try {
    const results = await searchTmdbForUi(query);
    return Response.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    if (message.includes("TMDB_API_KEY not set") || message.includes("tmdb_api_error")) {
      return Response.json({ error: "no_api_key" }, { status: 503 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
