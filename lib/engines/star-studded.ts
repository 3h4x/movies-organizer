// tamtam inspected 2026-05-21
import { discoverStarStudded } from "../tmdb";
import {
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function starStuddedEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const stars = await discoverStarStudded();
  const filtered = filterResults(stars, ctx);
  if (filtered.length === 0) return [];

  return [
    {
      reason: "Star-studded blockbusters you missed",
      type: "star_studded",
      recommendations: filtered.slice(0, 15),
    },
  ];
}
