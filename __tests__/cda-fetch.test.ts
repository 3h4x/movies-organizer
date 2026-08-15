// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-cda-fetch.db");

// ── fetch mock ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

// ── HTML builders ──────────────────────────────────────────────────────────────

function premiumHtml(movies: { title: string; url: string; poster: string }[]): string {
  return movies
    .map(
      (m) =>
        `<li class="mb-slide" title="${m.title}">` +
        `<a href="${m.url}">` +
        `<img src="${m.poster}" /></a></li>`,
    )
    .join("\n");
}

function categoryHtml(
  movies: { title: string; url: string; poster?: string }[],
): string {
  const posterTags = movies
    .map(
      (m) =>
        `<img class="cover-img" title="${m.title}" src="${m.poster ?? "https://img.cda.pl/p.jpg"}" />`,
    )
    .join("\n");
  const titleTags = movies
    .map(
      (m) =>
        `<a href="${m.url}" class="kino-title">${m.title}</a>`,
    )
    .join("\n");
  return posterTags + "\n" + titleTags;
}

function tmdbResult(overrides: {
  id: number;
  genre_ids?: number[];
  vote_average?: number;
  overview?: string | null;
  poster_path?: string | null;
}) {
  return {
    results: [
      {
        id: overrides.id,
        genre_ids: overrides.genre_ids ?? [18],
        vote_average: overrides.vote_average ?? 7.5,
        overview: overrides.overview ?? "Plot here.",
        poster_path: overrides.poster_path ?? "/poster.jpg",
      },
    ],
  };
}

// Respond to different URL patterns
function setupFetchMock({
  premiumMovies = [] as { title: string; url: string; poster: string }[],
  categoriesOk = false,
  tmdbResponses = [] as object[],
} = {}) {
  let tmdbCallIndex = 0;
  mockFetch.mockImplementation((url: string) => {
    const urlStr = String(url);

    // Premium page
    if (urlStr.endsWith("/premium")) {
      return Promise.resolve({
        ok: true,
        text: async () => premiumHtml(premiumMovies),
      });
    }

    // Category pages
    if (urlStr.includes("/premium/")) {
      if (categoriesOk) {
        // Return an empty valid page
        return Promise.resolve({ ok: true, text: async () => "" });
      }
      return Promise.resolve({ ok: false, status: 403 });
    }

    // TMDb search
    if (urlStr.includes("themoviedb.org")) {
      if (tmdbCallIndex < tmdbResponses.length) {
        const resp = tmdbResponses[tmdbCallIndex++];
        return Promise.resolve({
          ok: true,
          json: async () => resp,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ results: [] }),
      });
    }

    return Promise.resolve({ ok: false, status: 404 });
  });
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("fetchAndStoreCdaMovies", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    delete process.env.TMDB_API_KEY;
  });

  // Import lazily so fetch mock is in place before module loads
  async function fetchAndStore() {
    const { fetchAndStoreCdaMovies } = await import("@/lib/cda-fetch");
    return fetchAndStoreCdaMovies(db);
  }

  it("returns early without inserting when premium page returns no movies", async () => {
    setupFetchMock({ premiumMovies: [] });

    await fetchAndStore();

    const rows = db.prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'").all();
    expect(rows).toHaveLength(0);
  });

  it("returns early without rejecting when premium page fetch times out", async () => {
    mockFetch.mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/premium")) {
        return Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
      }
      return Promise.resolve({ ok: false, status: 403 });
    });

    await expect(fetchAndStore()).resolves.toBeUndefined();

    const rows = db.prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'").all();
    expect(rows).toHaveLength(0);
  });

  it("deletes existing cda records before inserting new ones", async () => {
    // Pre-seed a stale record
    db.prepare(
      "INSERT INTO recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url) VALUES (?, 'cda', 'old', 'Old Film', 2000, null, 0, null)",
    ).run(9999);

    // Return 1 new movie — should replace the stale record
    setupFetchMock({
      premiumMovies: [
        {
          title: "New Film (2023)",
          url: "https://www.cda.pl/video/44444/vfilm",
          poster: "https://img.cda.pl/new.jpg",
        },
      ],
      tmdbResponses: [tmdbResult({ id: 12345, vote_average: 7.0 })],
    });
    await fetchAndStore();

    const rows = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .all() as { tmdb_id: number }[];
    // Stale record (9999) replaced by new one (12345)
    expect(rows).toHaveLength(1);
    expect(rows[0].tmdb_id).toBe(12345);
  });

  it("continues storing premium movies when a category page fetch times out", async () => {
    mockFetch.mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/premium")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            premiumHtml([
              {
                title: "New Film (2023)",
                url: "https://www.cda.pl/video/44444/vfilm",
                poster: "https://img.cda.pl/new.jpg",
              },
            ]),
        });
      }
      if (urlStr.includes("/premium/akcji")) {
        return Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
      }
      if (urlStr.includes("/premium/")) {
        return Promise.resolve({ ok: false, status: 403 });
      }
      if (urlStr.includes("themoviedb.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => tmdbResult({ id: 12345, vote_average: 7.0 }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    await expect(fetchAndStore()).resolves.toBeUndefined();

    const rows = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .all() as { tmdb_id: number; title: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].tmdb_id).toBe(12345);
    expect(rows[0].title).toBe("New Film");
  });

  it("stores a movie with tmdb enrichment when TMDb returns a match", async () => {
    setupFetchMock({
      premiumMovies: [
        {
          title: "Inception (2010)",
          url: "https://www.cda.pl/video/12345/vfilm",
          poster: "https://img.cda.pl/inc.jpg",
        },
      ],
      tmdbResponses: [
        tmdbResult({ id: 27205, genre_ids: [28, 878], vote_average: 8.8, poster_path: "/p.jpg" }),
      ],
    });

    await fetchAndStore();

    const rows = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .all() as { tmdb_id: number; title: string; cda_url: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].tmdb_id).toBe(27205);
    expect(rows[0].title).toBe("Inception");
    expect(rows[0].cda_url).toBe("https://www.cda.pl/video/12345/vfilm");
  });

  it("stores a movie with a pseudo-id (hashCode) when TMDb returns no match", async () => {
    process.env.TMDB_API_KEY = ""; // disable enrichment — returns null when no key

    setupFetchMock({
      premiumMovies: [
        {
          title: "Mystery Film (2020)",
          url: "https://www.cda.pl/video/99999/vfilm",
          poster: "https://img.cda.pl/mys.jpg",
        },
      ],
    });

    await fetchAndStore();

    const rows = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .all() as { tmdb_id: number; rating: number }[];
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].tmdb_id).toBe("number");
    expect(rows[0].rating).toBe(0);
  });

  it("parses title and year correctly from 'Title (YYYY)' format", async () => {
    setupFetchMock({
      premiumMovies: [
        {
          title: "The Matrix (1999)",
          url: "https://www.cda.pl/video/11111/vfilm",
          poster: "https://img.cda.pl/mat.jpg",
        },
      ],
      tmdbResponses: [
        tmdbResult({ id: 603, vote_average: 8.7 }),
      ],
    });

    await fetchAndStore();

    const row = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .get() as { title: string; year: number } | undefined;
    expect(row?.title).toBe("The Matrix");
    expect(row?.year).toBe(1999);
  });

  it("strips Polish audio/subtitle markers from titles", async () => {
    // The regex strips "Lektor PL" only at end of string, so title must not have year after marker
    setupFetchMock({
      premiumMovies: [
        {
          title: "Interstellar Lektor PL",
          url: "https://www.cda.pl/video/22222/vfilm",
          poster: "https://img.cda.pl/int.jpg",
        },
      ],
      tmdbResponses: [tmdbResult({ id: 157336, vote_average: 8.6 })],
    });

    await fetchAndStore();

    const row = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .get() as { title: string; year: number | null } | undefined;
    expect(row?.title).toBe("Interstellar");
    expect(row?.year).toBeNull();
  });

  it("decodes HTML entities in movie titles", async () => {
    setupFetchMock({
      premiumMovies: [
        {
          title: "Pok&oacute;j strachu (2002)",
          url: "https://www.cda.pl/video/33333/vfilm",
          poster: "https://img.cda.pl/pok.jpg",
        },
      ],
      tmdbResponses: [tmdbResult({ id: 11111 })],
    });

    await fetchAndStore();

    const row = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .get() as { title: string } | undefined;
    expect(row?.title).toBe("Pokój strachu");
  });

  it("deduplicates movies by URL across premium and category pages", async () => {
    const sharedUrl = "https://www.cda.pl/video/77777/vfilm";

    mockFetch.mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/premium")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            premiumHtml([{ title: "Dune (2021)", url: sharedUrl, poster: "https://img.cda.pl/d.jpg" }]),
        });
      }
      if (urlStr.includes("/premium/akcji")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            categoryHtml([{ title: "Dune (2021)", url: sharedUrl }]),
        });
      }
      if (urlStr.includes("/premium/")) {
        return Promise.resolve({ ok: false });
      }
      if (urlStr.includes("themoviedb.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => tmdbResult({ id: 438631 }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    await fetchAndStore();

    const rows = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .all();
    // Should only be 1 even though it appears in both premium and a category
    expect(rows).toHaveLength(1);
  });

  it("does not include TV series from category pages (Sezon/serial filter)", async () => {
    mockFetch.mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/premium")) {
        return Promise.resolve({ ok: true, text: async () => "" });
      }
      if (urlStr.includes("/premium/dramaty")) {
        const seriesUrl = "https://www.cda.pl/video/88888/vfilm";
        const html =
          `<img class="cover-img" title="Breaking Bad Sezon 1" src="https://img.cda.pl/bb.jpg" />\n` +
          `<a href="${seriesUrl}" class="kino-title">Breaking Bad Sezon 1</a>\n` +
          `<a href="https://www.cda.pl/video/55555/vfilm" class="kino-title">Good Film (2020)</a>`;
        return Promise.resolve({ ok: true, text: async () => html });
      }
      if (urlStr.includes("/premium/")) {
        return Promise.resolve({ ok: false });
      }
      if (urlStr.includes("themoviedb.org")) {
        return Promise.resolve({
          ok: true,
          json: async () => tmdbResult({ id: 99999 }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    await fetchAndStore();

    const rows = db
      .prepare("SELECT * FROM recommended_movies WHERE engine = 'cda'")
      .all() as { title: string }[];
    expect(rows.every((r) => !r.title.includes("Breaking Bad"))).toBe(true);
  });
});
