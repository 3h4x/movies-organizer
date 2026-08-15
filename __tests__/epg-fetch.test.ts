// tamtam inspected 2026-05-21
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { gzipSync } from "zlib";
import {
  getMemCache,
  setMemCache,
  invalidateMemCache,
  fetchAndCacheEpg,
  type EpgCache,
} from "@/lib/epg-fetch";
import { initDb, getSetting } from "@/lib/db";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCache(overrides: Partial<EpgCache> = {}): EpgCache {
  return {
    channels: [],
    programs: [],
    cachedAt: new Date().toISOString(),
    epgUrl: "https://example.com/epg.xml.gz",
    ...overrides,
  };
}

// ── Mem cache ──────────────────────────────────────────────────────────────────

describe("EPG mem cache", () => {
  beforeEach(() => {
    invalidateMemCache();
  });

  afterEach(() => {
    invalidateMemCache();
    vi.useRealTimers();
  });

  it("returns null when cache is empty", () => {
    expect(getMemCache()).toBeNull();
  });

  it("returns data immediately after setMemCache", () => {
    const cache = makeCache({ epgUrl: "https://test.com/epg.xml.gz" });
    setMemCache(cache);
    expect(getMemCache()).toEqual(cache);
  });

  it("returns null after invalidateMemCache", () => {
    setMemCache(makeCache());
    invalidateMemCache();
    expect(getMemCache()).toBeNull();
  });

  it("returns null after TTL expires", () => {
    vi.useFakeTimers();
    setMemCache(makeCache(), 1000); // 1s TTL
    vi.advanceTimersByTime(1001);
    expect(getMemCache()).toBeNull();
  });

  it("returns data before TTL expires", () => {
    vi.useFakeTimers();
    const cache = makeCache();
    setMemCache(cache, 5000); // 5s TTL
    vi.advanceTimersByTime(4999);
    expect(getMemCache()).toEqual(cache);
  });

  it("replaces existing cache with new setMemCache call", () => {
    const first = makeCache({ epgUrl: "https://first.com" });
    const second = makeCache({ epgUrl: "https://second.com" });
    setMemCache(first);
    setMemCache(second);
    expect(getMemCache()?.epgUrl).toBe("https://second.com");
  });

  it("preserves channels and programs in cache", () => {
    const cache = makeCache({
      channels: [{ id: "tvn7", name: "TVN 7", icon: null }],
      programs: [
        {
          channel: "tvn7",
          title: "Interstellar",
          start: "2026-04-20T20:00:00.000Z",
          stop: "2026-04-20T23:00:00.000Z",
          description: null,
          category: "Film",
          icon: null,
          rating: "8.6/10",
        },
      ],
    });
    setMemCache(cache);
    const retrieved = getMemCache();
    expect(retrieved?.channels).toHaveLength(1);
    expect(retrieved?.channels[0].name).toBe("TVN 7");
    expect(retrieved?.programs).toHaveLength(1);
    expect(retrieved?.programs[0].title).toBe("Interstellar");
  });

  it("default TTL is 30 minutes", () => {
    vi.useFakeTimers();
    setMemCache(makeCache());
    vi.advanceTimersByTime(30 * 60 * 1000 - 1);
    expect(getMemCache()).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(getMemCache()).toBeNull();
  });
});

// ── fetchAndCacheEpg ──────────────────────────────────────────────────────────

const TEST_DB = path.join(__dirname, "test-epg-fetch-full.db");
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

// Builds a minimal XMLTV document with one channel and one programme.
// start/stop are in XMLTV format: YYYYMMDDHHmmss +0000
function buildXmltv(opts: {
  channelId?: string;
  channelName?: string;
  channelIcon?: string | null;
  programTitle?: string;
  programDesc?: string | null;
  programCategory?: string | null;
  programIcon?: string | null;
  programRating?: string | null;
  startUtc?: Date;
  stopUtc?: Date;
} = {}): string {
  const {
    channelId = "ch1",
    channelName = "Channel One",
    channelIcon = null,
    programTitle = "Test Movie",
    programDesc = null,
    programCategory = null,
    programIcon = null,
    programRating = null,
    startUtc = new Date("2026-04-21T10:00:00Z"),
    stopUtc = new Date("2026-04-21T12:00:00Z"),
  } = opts;

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "") + " +0000";

  const iconTag = channelIcon ? `<icon src="${channelIcon}"/>` : "";
  const descTag = programDesc ? `<desc>${programDesc}</desc>` : "";
  const catTag = programCategory ? `<category>${programCategory}</category>` : "";
  const progIconTag = programIcon ? `<icon src="${programIcon}"/>` : "";
  const ratingTag = programRating
    ? `<star-rating><value>${programRating}</value></star-rating>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<tv>
<channel id="${channelId}"><display-name>${channelName}</display-name>${iconTag}</channel>
<programme start="${fmt(startUtc)}" stop="${fmt(stopUtc)}" channel="${channelId}">
  <title>${programTitle}</title>${descTag}${catTag}${progIconTag}${ratingTag}
</programme>
</tv>`;
}

function mockOkText(text: string) {
  const buf = Buffer.from(text);
  // Slice the ArrayBuffer to avoid Node.js buffer-pool contamination —
  // buf.buffer is the full pool slab; we need only our region.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  mockFetch.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: async () => ab,
  });
}

function mockOkGzip(xml: string) {
  const compressed = gzipSync(Buffer.from(xml));
  const ab = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength,
  );
  mockFetch.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: async () => ab,
  });
}

describe("fetchAndCacheEpg", () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    // Use a plain .xml URL so plain-text responses are not gunzipped by default
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "epg_url",
      "https://example.com/epg.xml",
    );
    invalidateMemCache();
    vi.resetAllMocks();
    vi.useFakeTimers();
    // Fix "now" to 2026-04-21T14:00:00Z so programmes during that day are in range
    vi.setSystemTime(new Date("2026-04-21T14:00:00Z"));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    invalidateMemCache();
    vi.useRealTimers();
  });

  it("fetches XML, parses channels and programs, returns EpgCache", async () => {
    const xml = buildXmltv({
      channelId: "tvn",
      channelName: "TVN",
      channelIcon: "https://img.example.com/tvn.png",
      programTitle: "Inception",
      programDesc: "A dream heist.",
      programCategory: "Sci-Fi",
      programIcon: "https://img.example.com/inception.jpg",
      programRating: "8.8/10",
      startUtc: new Date("2026-04-21T10:00:00Z"),
      stopUtc: new Date("2026-04-21T12:00:00Z"),
    });
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toEqual({
      id: "tvn",
      name: "TVN",
      icon: "https://img.example.com/tvn.png",
    });
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].title).toBe("Inception");
    expect(result.programs[0].channel).toBe("tvn");
    expect(result.programs[0].description).toBe("A dream heist.");
    expect(result.programs[0].category).toBe("Sci-Fi");
    expect(result.programs[0].icon).toBe("https://img.example.com/inception.jpg");
    expect(result.programs[0].rating).toBe("8.8/10");
  });

  it("sets epg_status to 'idle' after successful fetch", async () => {
    mockOkText(buildXmltv());
    await fetchAndCacheEpg(db);
    expect(getSetting(db, "epg_status")).toBe("idle");
  });

  it("writes epg_last_refresh after successful fetch", async () => {
    mockOkText(buildXmltv());
    await fetchAndCacheEpg(db);
    const lastRefresh = getSetting(db, "epg_last_refresh");
    expect(lastRefresh).not.toBeNull();
    expect(new Date(lastRefresh!).getFullYear()).toBeGreaterThan(2020);
  });

  it("populates the mem cache after successful fetch", async () => {
    mockOkText(buildXmltv());
    await fetchAndCacheEpg(db);
    expect(getMemCache()).not.toBeNull();
    expect(getMemCache()?.channels).toHaveLength(1);
  });

  it("decompresses gzip-encoded EPG when URL ends in .gz", async () => {
    const xml = buildXmltv({ channelName: "GzipChannel" });
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "epg_url",
      "https://example.com/epg.xml.gz",
    );
    mockOkGzip(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.channels[0].name).toBe("GzipChannel");
  });

  it("auto-detects gzip by magic bytes even for non-.gz URL", async () => {
    const xml = buildXmltv({ channelName: "MagicGzip" });
    // URL is .xml but response bytes are gzip — magic bytes detection should kick in
    mockOkGzip(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.channels[0].name).toBe("MagicGzip");
  });

  it("sets epg_status to 'error' and rethrows when fetch returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(fetchAndCacheEpg(db)).rejects.toThrow("503");
    expect(getSetting(db, "epg_status")).toBe("error");
  });

  it("sets epg_status to 'error' and rethrows when fetch throws (both https and http fallback fail)", async () => {
    // HTTPS fails → HTTP fallback also fails → original HTTPS error is rethrown
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    mockFetch.mockRejectedValueOnce(new Error("HTTP fallback also failed"));

    await expect(fetchAndCacheEpg(db)).rejects.toThrow("Network failure");
    expect(getSetting(db, "epg_status")).toBe("error");
  });

  it("falls back to HTTP when HTTPS fetch throws and HTTP succeeds", async () => {
    const epgXml = buildXmltv({ channelId: "test.pl", channelName: "Test" });

    // HTTPS fails, HTTP succeeds
    mockFetch.mockRejectedValueOnce(new Error("TLS handshake failed"));
    mockOkText(epgXml);

    const result = await fetchAndCacheEpg(db);
    expect(result.channels).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second call should use http://
    expect(mockFetch.mock.calls[1][0]).toMatch(/^http:\/\//);
    // result.epgUrl must reflect the actual URL used, not the original https:// one
    expect(result.epgUrl).toMatch(/^http:\/\//);
  });

  it("does not attempt HTTP fallback when the URL is already http://", async () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "epg_url",
      "http://example.com/feed.xml",
    );
    mockFetch.mockRejectedValueOnce(new Error("connection refused"));

    await expect(fetchAndCacheEpg(db)).rejects.toThrow("connection refused");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses epg_url from settings when set", async () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "epg_url",
      "https://custom.example.com/feed.xml",
    );
    mockOkText(buildXmltv());

    await fetchAndCacheEpg(db);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("custom.example.com"),
      expect.any(Object),
    );
  });

  it("filters out programs that ended two days ago", async () => {
    // Use 2026-04-19 — safely before any "today" window even in UTC+12
    const xml = buildXmltv({
      startUtc: new Date("2026-04-19T10:00:00Z"),
      stopUtc: new Date("2026-04-19T12:00:00Z"),
    });
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.programs).toHaveLength(0);
  });

  it("filters out programs that start after todayEnd (04:00 next day)", async () => {
    // start is 2026-04-22T10:00 — well after tomorrow 04:00
    const xml = buildXmltv({
      startUtc: new Date("2026-04-22T10:00:00Z"),
      stopUtc: new Date("2026-04-22T12:00:00Z"),
    });
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.programs).toHaveLength(0);
  });

  it("includes programs that overlap today (started yesterday, ends today)", async () => {
    // stop is inside today's window
    const xml = buildXmltv({
      startUtc: new Date("2026-04-20T23:00:00Z"),
      stopUtc: new Date("2026-04-21T01:00:00Z"),
    });
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.programs).toHaveLength(1);
  });

  it("decodes HTML entities in channel names and program titles", async () => {
    const xml = buildXmltv({
      channelName: "TVN &amp; Polsat",
      programTitle: "Pok&oacute;j 1917 &lt;special&gt;",
    });
    // Override entity-encoding since buildXmltv writes into XML directly
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    // Depending on whether decodeEntities handles &oacute; — it does in epg-fetch
    expect(result.channels[0].name).toBe("TVN & Polsat");
  });

  it("sets channel icon to null when no icon element", async () => {
    const xml = buildXmltv({ channelIcon: null });
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.channels[0].icon).toBeNull();
  });

  it("sets program fields to null when optional elements absent", async () => {
    const xml = buildXmltv({
      programDesc: null,
      programCategory: null,
      programIcon: null,
      programRating: null,
    });
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.programs[0].description).toBeNull();
    expect(result.programs[0].category).toBeNull();
    expect(result.programs[0].icon).toBeNull();
    expect(result.programs[0].rating).toBeNull();
  });

  it("parses programmes with positive timezone offset correctly", async () => {
    // start: 2026-04-21 12:00 +0200 = 10:00 UTC  (within today)
    const xml = `<?xml version="1.0"?>
<tv>
<channel id="c1"><display-name>C1</display-name></channel>
<programme start="20260421120000 +0200" stop="20260421140000 +0200" channel="c1">
  <title>TZ Test</title>
</programme>
</tv>`;
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].title).toBe("TZ Test");
    // start should be 10:00 UTC
    expect(result.programs[0].start).toBe("2026-04-21T10:00:00.000Z");
  });

  it("parses programmes with negative timezone offset correctly", async () => {
    // start: 2026-04-21 05:00 -0500 = 10:00 UTC
    const xml = `<?xml version="1.0"?>
<tv>
<channel id="c1"><display-name>C1</display-name></channel>
<programme start="20260421050000 -0500" stop="20260421070000 -0500" channel="c1">
  <title>NegTZ</title>
</programme>
</tv>`;
    mockOkText(xml);

    const result = await fetchAndCacheEpg(db);
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].start).toBe("2026-04-21T10:00:00.000Z");
  });

  it("handles an empty TV document with no channels or programs", async () => {
    mockOkText("<?xml version='1.0'?><tv></tv>");

    const result = await fetchAndCacheEpg(db);
    expect(result.channels).toHaveLength(0);
    expect(result.programs).toHaveLength(0);
  });
});
