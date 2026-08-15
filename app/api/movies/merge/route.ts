import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { mergeMovies } from "@/lib/dedup";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const { sourceId, targetId } = await request.json();

  const result = mergeMovies(getDb(), sourceId, targetId);
  if (!result.ok) {
    if (result.status === 500) {
      console.error("Merge failed:", result.error);
    }
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    ok: true,
    message: "Movies merged successfully",
    targetId: result.targetId,
  });
}
