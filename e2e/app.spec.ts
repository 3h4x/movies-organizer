// tamtam inspected 2026-05-21
import { test, expect, Page, Locator } from "@playwright/test";
import { MOCK_MOVIES, MOCK_POSTER, MOCK_RECS, MOCK_SETTINGS } from "./fixtures";

async function mockAPIs(
  page: Page,
  movies = MOCK_MOVIES,
  moodRecommendations = [
    {
      reason: "High-energy action for tonight",
      type: "mood",
      recommendations: [
        {
          tmdb_id: 603,
          title: "The Matrix",
          year: 1999,
          genre: "Action, Science Fiction",
          rating: 8.7,
          poster_url: MOCK_POSTER,
        },
      ],
    },
  ],
) {
  await page.route("/api/movies", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: movies });
    } else {
      route.continue();
    }
  });
  await page.route("/api/settings", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: MOCK_SETTINGS });
    } else {
      route.continue();
    }
  });
  await page.route("/api/pl-title*", (route) =>
    route.fulfill({ json: { pl_title: "Ojciec Chrzestny", description: "" } })
  );
  await page.route("/api/recommendations/count", (route) =>
    route.fulfill({ json: { total: 12 } })
  );
  await page.route("/api/recommendations/mood*", (route) =>
    route.fulfill({
      json: moodRecommendations,
    })
  );
  await page.route("/api/recommendations*", (route) =>
    route.fulfill({ json: MOCK_RECS })
  );
}

async function goToLibrary(page: Page) {
  // Click Library tab and wait for movie cards to appear
  // Longer timeout to handle initial Next.js dev compilation
  await page.getByRole("button", { name: /^Library/ }).click();
  await expect(page.getByText("The Godfather")).toBeVisible({ timeout: 20_000 });
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe("page load", () => {
  test("shows FilmPick title and tabs", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /FilmPick/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Discover/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Library/ })).toBeVisible();
    // Use first() since "From Watchlist" rec category also matches /Watchlist/
    await expect(page.getByRole("button", { name: /^Watchlist/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Config/ })).toBeVisible();
  });

  test("Discover tab is active by default", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    const discoverBtn = page.getByRole("button", { name: /Discover/i });
    await expect(discoverBtn).toHaveClass(/text-white/);
  });

  test("shows search input after movies load", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
  });
});

test.describe("tab navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    // Wait for movies to load (needed for library/watchlist counts to appear)
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
  });

  test("switches to Library tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Library/ }).click();
    await expect(page).toHaveURL(/#library/);
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 8_000 });
  });

  test("switches to Watchlist tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    await expect(page).toHaveURL(/#wishlist/);
  });

  test("switches to Config tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Config/ }).click();
    await expect(page).toHaveURL(/#config/);
  });

  test("switches back to Discover tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Library/ }).click();
    await page.getByRole("button", { name: /^Discover/ }).click();
    await expect(page).toHaveURL(/#recommendations/);
  });

  test("restores Library tab from hash on load", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#library");
    await expect(page).toHaveURL(/#library/);
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({
      timeout: 8_000,
    });
  });
});

test.describe("library tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await goToLibrary(page);
  });

  test("renders movie cards for each movie", async ({ page }) => {
    await expect(page.getByText("The Godfather")).toBeVisible();
    await expect(page.getByText("Blade Runner 2049")).toBeVisible();
  });

  test("shows user rating badge on rated movie", async ({ page }) => {
    await expect(page.getByText("♥ 10/10").first()).toBeVisible();
    await expect(page.getByText("♥ 8/10").first()).toBeVisible();
  });

  test("shows sort/filter bar with sort options", async ({ page }) => {
    // SortFilterBar renders a select with sort options
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("shows movie count", async ({ page }) => {
    await expect(page.getByText(/Showing 2 of 2/)).toBeVisible();
  });

});

test.describe("library search filter", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await goToLibrary(page);
  });

  test("filters movies by title as user types", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");

    await expect(page.getByText("The Godfather")).toBeVisible();
    await expect(page.getByText("Blade Runner 2049")).not.toBeVisible();
  });

  test("clears filter with ESC", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");
    await expect(page.getByText("Blade Runner 2049")).not.toBeVisible();

    await searchInput.press("Escape");
    await expect(page.getByText("Blade Runner 2049")).toBeVisible();
  });

  test("shows movie count with filter active", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");
    await expect(page.getByText(/Showing 1 of 1/)).toBeVisible();
  });
});

test.describe("movie detail", () => {
  test("opens movie detail from a tmdb hash deep link", async ({ page }) => {
    await mockAPIs(page);
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      })
    );

    await page.goto("/#movie/238");
    const overlay = page.locator(".fixed.inset-0");
    await expect(overlay.getByText("The Godfather").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("opens movie detail on card click", async ({ page }) => {
    await mockAPIs(page);
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      })
    );
    await page.goto("/");
    await goToLibrary(page);

    // Click movie card — MovieDetail is rendered as a fixed overlay div
    await page.getByRole("button", { name: "Open The Godfather" }).click();
    // The overlay contains a close button and movie title
    await expect(page.locator(".fixed.inset-0").getByText("The Godfather").first()).toBeVisible({ timeout: 8_000 });
  });

  test("closes movie detail with close button", async ({ page }) => {
    await mockAPIs(page);
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      })
    );
    await page.goto("/");
    await goToLibrary(page);

    await page.getByRole("button", { name: "Open The Godfather" }).click();
    const overlay = page.locator(".fixed.inset-0");
    await expect(overlay).toBeVisible({ timeout: 8_000 });

    // Close button has title="Close" but text content "✕"
    await overlay.locator('[title="Close"]').click();
    await expect(overlay).not.toBeVisible({ timeout: 5_000 });
  });

  test("locks background scroll while movie detail is open", async ({ page }) => {
    await mockAPIs(page);
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      })
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#movie/238");
    await expect(page.locator(".fixed.inset-0").getByText("The Godfather").first()).toBeVisible({
      timeout: 8_000,
    });

    const startScrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 1200);

    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBe(startScrollY);
  });

  test("opens relink search above the detail modal from Fix Metadata", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      }),
    );
    await page.route("/api/search*", (route) =>
      route.fulfill({
        json: [
          {
            tmdb_id: 238,
            title: "The Godfather",
            year: 1972,
            genre: "Crime, Drama",
            rating: 9.2,
            poster_url: MOCK_POSTER,
            imdb_id: "tt0068646",
          },
        ],
      }),
    );
    await page.route("/api/movies/1", (route) => {
      if (route.request().method() === "PATCH") {
        route.fulfill({
          json: {
            ...MOCK_MOVIES[0],
            imdb_id: "tt0068646",
            source: "tmdb",
          },
        });
        return;
      }

      route.continue();
    });

    await page.goto("/");
    await goToLibrary(page);

    await page.getByRole("button", { name: "Open The Godfather" }).click();
    const detailOverlay = page.locator(".fixed.inset-0").filter({
      has: page.getByTitle("Management Menu"),
    });
    await expect(detailOverlay).toBeVisible({ timeout: 8_000 });

    await detailOverlay.getByTitle("Management Menu").click();
    await detailOverlay.getByRole("button", { name: /Fix Metadata/i }).click();

    await expect(detailOverlay).not.toBeVisible({ timeout: 5_000 });

    const searchOverlay = page.locator(".fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "Relink Metadata" }),
    });
    await expect(searchOverlay).toBeVisible({ timeout: 8_000 });

    const relinkHeading = searchOverlay.getByRole("heading", {
      name: "Relink Metadata",
    });
    await expect(relinkHeading).toBeVisible();

    const queryInput = searchOverlay.getByPlaceholder("Search movies...");
    await expect(queryInput).toBeVisible();
    await expect(queryInput).toHaveValue("The Godfather");

    await searchOverlay.locator('[title="Update existing movie"]').click();
    await expect(searchOverlay).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe("mobile regressions", () => {
  const mobileViewport = { width: 375, height: 812 };

  test.use({
    viewport: mobileViewport,
    hasTouch: true,
    isMobile: true,
  });

  async function gotoMobile(page: Page, path = "/") {
    await page.setViewportSize(mobileViewport);
    await page.goto(path);
    await expect(page.getByPlaceholder("Search library...")).toBeVisible({
      timeout: 20_000,
    });
  }

  async function mockMovieDetail(page: Page) {
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      }),
    );
  }

  test("shows movie title and ratings above the poster in the detail modal", async ({
    page,
  }) => {
    await mockAPIs(page);
    await mockMovieDetail(page);
    await gotoMobile(page, "/#movie/238");

    const dialog = page.getByRole("dialog", { name: "The Godfather" });
    const titleBox = await visibleBox(
      dialog.getByRole("heading", { name: "The Godfather" }),
    );
    const ratingBox = await visibleBox(dialog.getByTitle("Click to change rating"));
    const posterBox = await visibleBox(
      dialog.getByRole("img", { name: "The Godfather" }).first(),
    );

    expect(titleBox.y + titleBox.height).toBeLessThan(posterBox.y);
    expect(ratingBox.y + ratingBox.height).toBeLessThan(posterBox.y);
  });

  test("renders touch action buttons in recommendations and watchlist", async ({
    page,
  }) => {
    const wishlistMovie = {
      ...MOCK_MOVIES[0],
      id: 99,
      wishlist: 1,
      user_rating: null,
    };
    await mockAPIs(page, [...MOCK_MOVIES, wishlistMovie]);
    await gotoMobile(page);

    const recCard = page.locator('[class*="group/rec"]').filter({ hasText: "GoodFellas" });
    await recCard.getByRole("button", { name: "Show actions" }).click();
    await expect(
      recCard.getByRole("button", { name: "Add to watchlist" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    const wishCard = page.locator('[class*="group/wish"]').filter({ hasText: "The Godfather" });
    await wishCard.getByRole("button", { name: "Show actions" }).click();
    await expect(
      wishCard.getByRole("button", { name: "Remove from watchlist" }),
    ).toBeVisible();
  });

  test("keeps watchlist action buttons the same size as recommendation actions", async ({
    page,
  }) => {
    const wishlistMovie = {
      ...MOCK_MOVIES[0],
      id: 99,
      wishlist: 1,
      user_rating: null,
    };
    await mockAPIs(page, [...MOCK_MOVIES, wishlistMovie]);
    await gotoMobile(page);

    const recCard = page.locator('[class*="group/rec"]').filter({ hasText: "GoodFellas" });
    await recCard.getByRole("button", { name: "Show actions" }).click();
    const recActionBox = await visibleBox(
      recCard.getByRole("button", { name: "Add to watchlist" }),
    );

    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    const wishCard = page.locator('[class*="group/wish"]').filter({ hasText: "The Godfather" });
    await wishCard.getByRole("button", { name: "Show actions" }).click();
    const watchlistActionBox = await visibleBox(
      wishCard.getByRole("button", { name: "Watched & liked" }),
    );

    expect(Math.round(watchlistActionBox.width)).toBe(Math.round(recActionBox.width));
    expect(Math.round(watchlistActionBox.height)).toBe(Math.round(recActionBox.height));
  });

  test("keeps the mobile header decluttered into separate logo and search rows", async ({
    page,
  }) => {
    await mockAPIs(page);
    await gotoMobile(page);

    const headerRowBox = await visibleBox(page.getByTestId("app-header-row"));
    const searchRowBox = await visibleBox(page.getByTestId("app-search-row"));
    const searchBox = await visibleBox(page.getByPlaceholder("Search library..."));

    expect(searchRowBox.y).toBeGreaterThanOrEqual(headerRowBox.y + headerRowBox.height);
    expect(searchBox.x).toBeGreaterThanOrEqual(0);
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(mobileViewport.width);
  });

  test("stacks TV rows vertically below the desktop breakpoint", async ({
    page,
  }) => {
    const now = new Date();
    const start = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const stop = new Date(now.getTime() + 90 * 60 * 1000).toISOString();

    await mockAPIs(page);
    await page.route("/api/tv", (route) =>
      route.fulfill({
        json: {
          channels: [{ id: "polsat-film", name: "Polsat Film HD", icon: null }],
          programs: [
            {
              channel: "polsat-film",
              title: "Stacked Film",
              start,
              stop,
              description: null,
              category: "Film",
              icon: null,
              rating: null,
            },
          ],
          cachedAt: now.toISOString(),
          epgUrl: "",
          cached: true,
        },
      }),
    );
    await page.route("/api/tv/blacklist", (route) => route.fulfill({ json: [] }));
    await page.route("/api/tv/enrich", (route) =>
      route.fulfill({ json: { "Stacked Film": { rating: 7.4, year: 1999 } } }),
    );
    await gotoMobile(page, "/#tv");

    const mobileRow = page.getByTestId("tv-mobile-row").filter({
      hasText: "Stacked Film",
    });
    await expect(mobileRow).toBeVisible();
    await expect(page.getByTestId("tv-desktop-row").filter({ hasText: "Stacked Film" })).not.toBeVisible();

    const titleBox = await visibleBox(mobileRow.getByText("Stacked Film"));
    const channelBox = await visibleBox(mobileRow.getByText("Polsat Film"));
    expect(titleBox.y).toBeGreaterThan(channelBox.y);
  });

  test("allows Config sub-tab navigation to scroll horizontally", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.route("/api/movies?detached=1", (route) =>
      route.fulfill({ json: [] }),
    );
    await gotoMobile(page, "/#config");

    const tabStrip = page.getByTestId("config-tab-strip");
    await expect(tabStrip.getByRole("button", { name: "Library" })).toBeVisible();

    const metrics = await tabStrip.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    await tabStrip.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect
      .poll(() => tabStrip.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(metrics.scrollLeft);
  });

  test("pluralizes mood pick count for one and many picks", async ({ page }) => {
    await mockAPIs(page);
    await gotoMobile(page, "/#recommendations/mood/action_evening");
    await expect(page.getByText(/1 pick$/)).toBeVisible();

    const manyPage = await page.context().newPage();
    try {
      await mockAPIs(
        manyPage,
        MOCK_MOVIES,
        [
          {
            reason: "High-energy action for tonight",
            type: "mood",
            recommendations: Array.from({ length: 5 }, (_, index) => ({
              tmdb_id: 700 + index,
              title: `Action Pick ${index + 1}`,
              year: 2000 + index,
              genre: "Action",
              rating: 7.5,
              poster_url: MOCK_POSTER,
            })),
          },
        ],
      );
      await gotoMobile(manyPage, "/#recommendations/mood/action_evening");
      await expect(manyPage.getByText(/5 picks$/)).toBeVisible();
    } finally {
      await manyPage.close();
    }
  });

  test("keeps the rightmost app tab inside the mobile viewport", async ({
    page,
  }) => {
    await mockAPIs(page);
    await gotoMobile(page, "/#config");

    const tabStripBox = await visibleBox(page.getByTestId("app-tab-strip"));
    const activeTabBox = await visibleBox(
      page.getByRole("button", { name: /^Config/ }),
    );

    expect(activeTabBox.x).toBeGreaterThanOrEqual(0);
    expect(activeTabBox.x + activeTabBox.width).toBeLessThanOrEqual(
      mobileViewport.width,
    );
    expect(tabStripBox.x + tabStripBox.width).toBeLessThanOrEqual(
      mobileViewport.width,
    );
  });
});

test.describe("discover / recommendations tab", () => {
  test("shows recommendation cards after load", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByText("GoodFellas")).toBeVisible({ timeout: 10_000 });
  });

  test("shows a readable empty state for invalid mood routes", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#recommendations/mood/not-a-real-preset");
    await expect(page.getByText("Unknown mood preset")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(
        `"not-a-real-preset" isn't available in this build. Choose one from the Mood menu.`
      )
    ).toBeVisible();
  });

  test("restores a valid mood route from the hash", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#recommendations/mood/action_evening");
    await expect(page.getByRole("button", { name: /Action Evening/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("The Matrix")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Unknown mood preset")).not.toBeVisible();
  });

  test("shows empty state when no movies", async ({ page }) => {
    await page.route("/api/movies", (route) => route.fulfill({ json: [] }));
    await page.route("/api/settings", (route) => route.fulfill({ json: MOCK_SETTINGS }));
    await page.route("/api/recommendations/count", (route) =>
      route.fulfill({ json: { total: 0 } })
    );
    await page.goto("/");
    await expect(page.getByText("No recommendations yet")).toBeVisible();
  });

  test("category filter tabs are visible", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    // Wait for movies to load first (needed for rec dropdowns to appear)
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
    // Engine dropdown trigger shows "All" (default category), Mood dropdown trigger shows "Mood"
    await expect(page.getByRole("button", { name: /^All/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mood/ })).toBeVisible();
  });

  test("switching category tab updates URL hash", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
    // Open the engine dropdown, then pick "By Genre" from inside it
    await page.getByRole("button", { name: /^All/ }).click();
    await page.getByRole("button", { name: "By Genre" }).click();
    await expect(page).toHaveURL(/#recommendations\/genre/);
  });

  test("dropdown controls stay clickable while the backdrop is open", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();

    const engineButton = page.getByRole("button", { name: /^All/ }).first();
    const moodButton = page.getByRole("button", { name: /^Mood/ }).first();

    await engineButton.click();
    await expect(page.getByRole("button", { name: "By Genre" })).toBeVisible();

    await engineButton.click();
    await expect(page.getByRole("button", { name: "By Genre" })).not.toBeVisible();

    await engineButton.click();
    await moodButton.click();
    await expect(page.getByRole("button", { name: "Action Evening" })).toBeVisible();

    await page.getByRole("button", { name: "Action Evening" }).click();
    await expect(page).toHaveURL(/#recommendations\/mood\/action_evening/);
    await expect(page.getByText("The Matrix")).toBeVisible({ timeout: 10_000 });
  });

  test("keeps recommendation filters below the sticky nav on narrow viewports", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.setViewportSize({ width: 990, height: 344 });
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();

    const activeTab = page.getByRole("button", { name: /^Discover/ });
    const engineButton = page.getByRole("button", { name: /^All/ }).first();
    const moodButton = page.getByRole("button", { name: /^Mood/ }).first();

    const activeTabBox = await activeTab.boundingBox();
    const engineButtonBox = await engineButton.boundingBox();
    const moodButtonBox = await moodButton.boundingBox();

    expect(activeTabBox).not.toBeNull();
    expect(engineButtonBox).not.toBeNull();
    expect(moodButtonBox).not.toBeNull();

    expect(engineButtonBox!.y).toBeGreaterThanOrEqual(
      activeTabBox!.y + activeTabBox!.height,
    );
    expect(moodButtonBox!.y).toBeGreaterThanOrEqual(
      activeTabBox!.y + activeTabBox!.height,
    );
  });

  test("does not let recommendation filters paint above the sticky nav while scrolling", async ({
    page,
  }) => {
    const tallRecs = [
      {
        reason: "Because you liked crime epics",
        type: "genre",
        recommendations: Array.from({ length: 24 }, (_, index) => ({
          tmdb_id: 1000 + index,
          title: `Movie ${index + 1}`,
          year: 2000 + index,
          genre: "Action",
          rating: 7.5,
          poster_url: null,
        })),
      },
    ];

    await page.route("/api/movies", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: MOCK_MOVIES });
      } else {
        route.continue();
      }
    });
    await page.route("/api/settings", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: MOCK_SETTINGS });
      } else {
        route.continue();
      }
    });
    await page.route("/api/recommendations/count", (route) =>
      route.fulfill({ json: { total: 24 } }),
    );
    await page.route("/api/recommendations/mood*", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("/api/recommendations*", (route) =>
      route.fulfill({ json: tallRecs }),
    );

    await page.setViewportSize({ width: 990, height: 344 });
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 220));

    const activeTab = page.getByRole("button", { name: /^Discover/ });
    const engineButton = page.getByRole("button", { name: /^All/ }).first();
    const activeTabBox = await activeTab.boundingBox();
    const engineButtonBox = await engineButton.boundingBox();

    expect(activeTabBox).not.toBeNull();
    expect(engineButtonBox).not.toBeNull();
    expect(engineButtonBox!.y).toBeLessThan(activeTabBox!.y + activeTabBox!.height);

    const probeX = Math.floor(engineButtonBox!.x + engineButtonBox!.width / 2);
    const probeY = Math.floor(
      Math.max(activeTabBox!.y + 2, engineButtonBox!.y + 8),
    );

    const topButtonText = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("button")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      { x: probeX, y: probeY },
    );

    expect(topButtonText).toContain("Discover");
  });
});

test.describe("search input typing across tabs", () => {
  // Regression: the global search box renders on every tab, but a stray effect
  // used to wipe searchQuery on any tab that wasn't library/search. That made
  // the input impossible to type into on Discover/Watchlist/Config/TV — every
  // keystroke was cleared. These tests guard that typing always sticks.
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
  });

  test("lets the user type in search on the Discover tab", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");
    await expect(searchInput).toHaveValue("godfather");
  });

  test("lets the user type in search on the Watchlist tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    await expect(page).toHaveURL(/#wishlist/);

    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");
    await expect(searchInput).toHaveValue("godfather");
  });

  test("lets the user type in search on the Config tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Config/ }).click();
    await expect(page).toHaveURL(/#config/);

    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");
    await expect(searchInput).toHaveValue("godfather");
  });

  test("typing on Discover surfaces the matching library movie", async ({
    page,
  }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");

    await expect(page.getByText("The Godfather")).toBeVisible();
    await expect(page.getByText("Blade Runner 2049")).not.toBeVisible();
  });
});

test.describe("config tab", () => {
  test("renders config panel with TMDb key status", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#config");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/TMDb/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("keeps the active app tab visible on mobile hash loads", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#config");
    await page.waitForLoadState("networkidle");

    const activeTab = page.getByRole("button", { name: /^Config/ });
    await expect(activeTab).toBeVisible();
    const box = await activeTab.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("library tab responsive", () => {
  test("keeps the active sort chip visible on mobile hash loads", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#library");
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({
      timeout: 8_000,
    });

    const activeSort = page.getByRole("button", { name: "Date Added" });
    await expect(activeSort).toBeVisible();
    const box = await activeSort.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test("keeps the active sort chip visible after resizing from desktop to mobile", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#library");
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({
      timeout: 8_000,
    });

    await page.setViewportSize({ width: 375, height: 812 });

    const activeSort = page.getByRole("button", { name: "Date Added" });
    await expect(activeSort).toBeVisible();
    const box = await activeSort.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("tv tab", () => {
  test("keeps the active TV tab visible on mobile hash loads", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.route("/api/tv", (route) =>
      route.fulfill({
        json: {
          channels: [],
          programs: [],
          cachedAt: new Date().toISOString(),
          epgUrl: "",
          cached: true,
        },
      }),
    );
    await page.route("/api/tv/blacklist", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("/api/tv/enrich", (route) => route.fulfill({ json: {} }));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#tv");
    await page.waitForLoadState("networkidle");

    const activeTab = page.getByRole("button", { name: /^TV$/ });
    await expect(activeTab).toBeVisible();
    const box = await activeTab.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("watchlist tab", () => {
  test("shows empty state when watchlist is empty", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    await expect(page.getByText("Your watchlist is empty")).toBeVisible({ timeout: 8_000 });
  });

  test("shows watchlist movies", async ({ page }) => {
    const wishlistMovie = { ...MOCK_MOVIES[0], id: 99, wishlist: 1, user_rating: null };
    await page.route("/api/movies", (route) =>
      route.fulfill({ json: [wishlistMovie] })
    );
    await page.route("/api/settings", (route) => route.fulfill({ json: MOCK_SETTINGS }));
    await page.route("/api/recommendations/count", (route) =>
      route.fulfill({ json: { total: 0 } })
    );
    await page.goto("/");
    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    await expect(page.getByText("The Godfather")).toBeVisible({ timeout: 8_000 });
  });
});
