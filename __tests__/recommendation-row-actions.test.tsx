// tamtam inspected 2026-05-21
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationGroup } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

const captured = {
  actions: [] as Array<{
    key: string;
    onClick: () => void;
  }>,
  rowProps: null as {
    onAction: (
      tmdbId: number,
      action: string,
      rec: TmdbSearchResult,
      fromMood?: boolean,
      engine?: string,
    ) => void;
  } | null,
};

vi.mock("@/components/CardActionStack", () => ({
  default: ({
    actions,
  }: {
    actions: Array<{
      key: string;
      onClick: () => void;
    }>;
  }) => {
    captured.actions = actions;
    return null;
  },
}));

vi.mock("@/components/MovieCard", () => ({
  default: () => null,
}));

const rec: TmdbSearchResult = {
  title: "Heat",
  year: 1995,
  genre: "Crime",
  rating: 8.3,
  poster_url: null,
  tmdb_id: 949,
  imdb_id: "tt0113277",
};

describe("grouped recommendation action wiring", () => {
  beforeEach(() => {
    captured.actions = [];
    captured.rowProps = null;
  });

  it("passes grouped row actions with fromMood false and the row engine", () => {
    vi.resetModules();
    const onAction = vi.fn();
    let RecommendationRow: typeof import("@/components/RecommendationRow").default;

    return import("@/components/RecommendationRow").then((module) => {
      RecommendationRow = module.default;

      renderToStaticMarkup(
        <RecommendationRow
          reason="Because you liked crime"
          type="movie"
          recommendations={[rec]}
          onAction={onAction}
          onClickMovie={vi.fn()}
        />,
      );

      const dismissAction = captured.actions.find((action) => action.key === "dismiss");
      expect(dismissAction).toBeDefined();

      dismissAction?.onClick();

      expect(onAction).toHaveBeenCalledWith(949, "dismiss", rec, false, "movie");
    });
  });

  it("forwards grouped row actions into handleRecAction using the non-mood path", async () => {
    vi.resetModules();
    const handleRecAction = vi.fn();
    const recommendations: RecommendationGroup[] = [
      {
        reason: "Because you liked crime",
        type: "movie",
        recommendations: [rec],
      },
    ];
    vi.doMock("@/components/RecommendationRow", () => ({
      default: (props: typeof captured.rowProps) => {
        captured.rowProps = props;
        return null;
      },
    }));
    const { default: RecommendationsView } = await import(
      "@/components/views/RecommendationsView"
    );

    renderToStaticMarkup(
      <RecommendationsView
        hasMovies
        disabledEngines={[]}
        invalidMoodKey={null}
        clearInvalidMood={vi.fn()}
        recs={{
          recGroups: {},
          setRecGroups: vi.fn(),
          recLoading: {},
          totalRecsCount: 1,
          setTotalRecsCount: vi.fn(),
          recsLoading: false,
          recommendations,
          moodGroups: [],
          moodLoading: false,
          moodError: null,
          recCategory: "movie",
          activeMood: null,
          groupOrder: [],
          setGroupOrder: vi.fn(),
          categoryCounts: { movie: 1 },
          lastRecsRefresh: null,
          engineDropdownOpen: false,
          setEngineDropdownOpen: vi.fn(),
          moodDropdownOpen: false,
          setMoodDropdownOpen: vi.fn(),
          setRecCategory: vi.fn(),
          setActiveMood: vi.fn(),
          fetchEngine: vi.fn(async () => {}),
          refreshRecs: vi.fn(),
          removeFromView: vi.fn(),
          handleRecAction,
          handleRecClick: vi.fn(async () => {}),
        }}
      />,
    );

    expect(captured.rowProps).not.toBeNull();

    captured.rowProps?.onAction(949, "wishlist", rec, false, "movie");

    expect(handleRecAction).toHaveBeenCalledWith(
      949,
      "wishlist",
      rec,
      false,
      "movie",
    );
  });
});
