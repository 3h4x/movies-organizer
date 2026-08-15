// tamtam inspected 2026-05-21
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AppNav from "@/components/AppNav";

describe("AppNav", () => {
  it("routes the FilmPick home control through the recommendations hash", () => {
    const html = renderToStaticMarkup(
      <AppNav
        activeTab="wishlist"
        setActiveTab={vi.fn()}
        initialLoad={false}
        searchQuery=""
        setSearchQuery={vi.fn()}
        moviesCount={2053}
        wishlistCount={9}
        totalRecsCount={42}
        categoryCounts={{ all: 42 }}
        epgEnabled
        libraryPath="/Volumes/video/Movies"
        onSync={vi.fn()}
        onImport={vi.fn()}
        onSearchEnter={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('aria-label="Go to FilmPick home"');
    expect(html).toContain('href="#recommendations"');
  });
});
