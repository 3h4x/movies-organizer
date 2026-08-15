// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tmdb", () => ({
  getTmdbHealth: vi.fn(),
}));

import { GET } from "@/app/api/tmdb-health/route";
import { getTmdbHealth } from "@/lib/tmdb";

const mockGetTmdbHealth = vi.mocked(getTmdbHealth);

describe("GET /api/tmdb-health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the TMDb tracker payload without secret-bearing fields", async () => {
    mockGetTmdbHealth.mockReturnValue({
      processLocal: true,
      liveRequestCount: 3,
      cacheHitCount: 1,
      retryCount: 1,
      nonOkCount: 1,
      last429At: "2026-05-17T12:00:00.000Z",
      lastErrorStatus: 429,
      lastErrorMessage: "Too Many Requests",
      updatedAt: "2026-05-17T12:00:01.000Z",
      helpers: {
        searchTmdb: {
          liveRequestCount: 3,
          cacheHitCount: 0,
          retryCount: 1,
          nonOkCount: 1,
        },
      },
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.liveRequestCount).toBe(3);
    expect(data.helpers.searchTmdb.retryCount).toBe(1);
    expect(data.TMDB_API_KEY).toBeUndefined();
    expect(data.Authorization).toBeUndefined();
    expect(data.authorization).toBeUndefined();
    expect(data.rawHeaders).toBeUndefined();
  });
});
