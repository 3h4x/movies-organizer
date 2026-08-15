import { discoverByPerson, getMovieCredits } from "../tmdb";
import {
  attachTrace,
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function directorEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  // Check top-rated movies for recurring directors
  const highRated = ctx.library
    .filter((m) => m.tmdb_id && (m.user_rating ?? 0) >= 7)
    .sort((a, b) => (b.user_rating ?? 0) - (a.user_rating ?? 0))
    .slice(0, 50);

  const directorCounts = new Map<
    number,
    { name: string; count: number; avgRating: number }
  >();

  const creditResults = await Promise.allSettled(
    highRated.map((m) => getMovieCredits(m.tmdb_id!)),
  );
  creditResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const rating = highRated[i].user_rating ?? 7;
    for (const dir of result.value.directors) {
      const existing = directorCounts.get(dir.id);
      if (existing) {
        existing.count++;
        existing.avgRating =
          (existing.avgRating * (existing.count - 1) + rating) /
          existing.count;
      } else {
        directorCounts.set(dir.id, { name: dir.name, count: 1, avgRating: rating });
      }
    }
  });

  const minFilms = ctx.config?.director_min_films ?? 2;
  const topDirectors = [...directorCounts.entries()]
    .filter(([, v]) => v.count >= minFilms || v.avgRating >= 9)
    .map((entry) => ({ entry, score: entry[1].count * entry[1].avgRating }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ entry }) => entry);

  const discoverResults = await Promise.allSettled(
    topDirectors.map(([id]) => discoverByPerson(id)),
  );
  const groups: RecommendationGroup[] = [];
  discoverResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const [, { name }] = topDirectors[i];
    const filtered = filterResults(result.value, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `More from director ${name}`,
        type: "director",
        recommendations: attachTrace(filtered.slice(0, 15), {
          engine: "director",
          seedKind: "director",
          seedId: topDirectors[i][0],
          seedName: name,
        }),
      });
    }
  });
  return groups;
}
