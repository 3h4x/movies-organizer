// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scrapeCdaPremium, scrapeCdaCollection } from "@/lib/cda";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

function mockHtmlResponse(html: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    text: async () => html,
  });
}

function mockFailResponse() {
  mockFetch.mockResolvedValueOnce({ ok: false });
}

function makeSlideLi(title: string, href: string, imgSrc: string): string {
  return `<li class="mb-slide" title="${title}"><a href="${href}vfilm"><img class="foo" src="${imgSrc}" /></a></li>`;
}

describe("scrapeCdaPremium", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches /premium and returns parsed movies", async () => {
    const html = makeSlideLi(
      "Inception (2010)",
      "/vfilm/12345",
      "https://img.cda.pl/poster1.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.cda.pl/premium",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
    expect(movies[0].year).toBe(2010);
    expect(movies[0].url).toBe("https://www.cda.pl/vfilm/12345vfilm");
    expect(movies[0].poster_url).toBe("https://img.cda.pl/poster1.jpg");
  });

  it("returns empty array when fetch fails", async () => {
    mockFailResponse();
    const movies = await scrapeCdaPremium();
    expect(movies).toHaveLength(0);
  });

  it("returns empty array when page has no matching elements", async () => {
    mockHtmlResponse("<html><body><p>No movies</p></body></html>");
    const movies = await scrapeCdaPremium();
    expect(movies).toHaveLength(0);
  });

  it("parses multiple movies", async () => {
    const html =
      makeSlideLi("Movie One (2020)", "/vfilm/aaa", "https://img.cda.pl/a.jpg") +
      makeSlideLi("Movie Two (2021)", "/vfilm/bbb", "https://img.cda.pl/b.jpg");
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies).toHaveLength(2);
    expect(movies[0].title).toBe("Movie One");
    expect(movies[1].title).toBe("Movie Two");
  });

  it("deduplicates movies with the same URL", async () => {
    const slide = makeSlideLi(
      "Duplicate (2019)",
      "/vfilm/dup",
      "https://img.cda.pl/d.jpg",
    );
    mockHtmlResponse(slide + slide);

    const movies = await scrapeCdaPremium();
    expect(movies).toHaveLength(1);
  });

  it("uses absolute URL from href when href starts with https", async () => {
    const html = makeSlideLi(
      "AbsUrl (2022)",
      "https://www.cda.pl/vfilm/abs",
      "https://img.cda.pl/abs.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies[0].url).toBe("https://www.cda.pl/vfilm/absvfilm");
  });

  it("returns null year when title has no year", async () => {
    const html = makeSlideLi(
      "NoYear Movie",
      "/vfilm/noyear",
      "https://img.cda.pl/ny.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies[0].year).toBeNull();
    expect(movies[0].title).toBe("NoYear Movie");
  });
});

describe("scrapeCdaCollection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the given collection path and returns movies", async () => {
    const html = makeSlideLi(
      "Collection Film (2018)",
      "/vfilm/col1",
      "https://img.cda.pl/col.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaCollection("/kolekcja/horrory");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.cda.pl/kolekcja/horrory",
      expect.any(Object),
    );
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Collection Film");
    expect(movies[0].year).toBe(2018);
  });

  it("uses absolute URL when collection path is already absolute", async () => {
    mockHtmlResponse("");
    await scrapeCdaCollection("https://www.cda.pl/custom/path");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.cda.pl/custom/path",
      expect.any(Object),
    );
  });

  it("returns empty array when fetch fails", async () => {
    mockFailResponse();
    const movies = await scrapeCdaCollection("/kolekcja/comedy");
    expect(movies).toHaveLength(0);
  });
});

describe("title parsing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("strips Polish streaming suffixes from titles", async () => {
    const cases = [
      ["Film Lektor PL", "Film"],
      ["Movie Napisy PL", "Movie"],
      ["Kino Cały film PL", "Kino"],
      ["Show Dubbing PL", "Show"],
    ];

    for (const [rawTitle, expectedTitle] of cases) {
      const html = makeSlideLi(rawTitle, `/vfilm/${Math.random()}`, "https://img.cda.pl/p.jpg");
      mockHtmlResponse(html);
      const movies = await scrapeCdaPremium();
      expect(movies[0]?.title ?? "").toBe(expectedTitle);
    }
  });

  it("decodes HTML entities in titles", async () => {
    const html = makeSlideLi(
      "Pok&oacute;j (2015)",
      "/vfilm/room",
      "https://img.cda.pl/room.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies[0].title).toBe("Pokój");
    expect(movies[0].year).toBe(2015);
  });

  it("decodes &amp; in titles", async () => {
    const html = makeSlideLi(
      "War &amp; Peace (2016)",
      "/vfilm/wp",
      "https://img.cda.pl/wp.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies[0].title).toBe("War & Peace");
  });

  it("decodes &lt; and &gt; in titles", async () => {
    const html = makeSlideLi(
      "&lt;Title&gt; (2020)",
      "/vfilm/lt",
      "https://img.cda.pl/lt.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies[0].title).toBe("<Title>");
  });

  it("decodes &quot; in titles", async () => {
    const html = makeSlideLi(
      "He Said &quot;Yes&quot; (2017)",
      "/vfilm/quot",
      "https://img.cda.pl/q.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies[0].title).toBe('He Said "Yes"');
  });

  it("skips entries with empty title after parsing", async () => {
    // A title that reduces to empty after stripping suffix
    const html = makeSlideLi(
      "Lektor PL",
      "/vfilm/empty",
      "https://img.cda.pl/e.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    expect(movies).toHaveLength(0);
  });

  it("handles title with year and Lektor suffix: strips suffix then extracts year", async () => {
    const html = makeSlideLi(
      "Interstellar (2014) Lektor PL",
      "/vfilm/inter",
      "https://img.cda.pl/inter.jpg",
    );
    mockHtmlResponse(html);

    const movies = await scrapeCdaPremium();
    // "Lektor PL" is stripped first, then year "(2014)" is extracted normally
    expect(movies[0].title).toBe("Interstellar");
    expect(movies[0].year).toBe(2014);
  });
});
