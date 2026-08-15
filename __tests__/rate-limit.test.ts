// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  check,
  rateLimit,
  getClientIp,
  _resetForTests,
  _setBucketConfigForTests,
  type RateLimitBucket,
} from "@/lib/rate-limit";

function makeRequest(url = "http://localhost/api/test", headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

describe("getClientIp", () => {
  const originalEnv = process.env.TRUSTED_PROXY;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = originalEnv;
  });

  it("returns 'anon' when TRUSTED_PROXY is not set", () => {
    delete process.env.TRUSTED_PROXY;
    const req = makeRequest("http://localhost/", { "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(req)).toBe("anon");
  });

  it("returns 'anon' when TRUSTED_PROXY is 0", () => {
    process.env.TRUSTED_PROXY = "0";
    const req = makeRequest("http://localhost/", { "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(req)).toBe("anon");
  });

  it("reads x-forwarded-for first IP when TRUSTED_PROXY=1", () => {
    process.env.TRUSTED_PROXY = "1";
    const req = makeRequest("http://localhost/", { "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for absent", () => {
    process.env.TRUSTED_PROXY = "1";
    const req = makeRequest("http://localhost/", { "x-real-ip": "9.9.9.9" });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'anon' when TRUSTED_PROXY=true and no IP headers", () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest();
    expect(getClientIp(req)).toBe("anon");
  });

  it("does not trust forwarded headers when TRUSTED_PROXY=true", () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest("http://localhost/", { "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(req)).toBe("anon");
  });
});

describe("check — token bucket", () => {
  beforeEach(() => {
    _resetForTests();
    _setBucketConfigForTests("mutation", { limit: 3, windowMs: 60_000 });
  });

  afterEach(() => {
    _resetForTests();
  });

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(check("mutation", "test-ip").allowed).toBe(true);
    }
  });

  it("denies the request beyond the limit", () => {
    for (let i = 0; i < 3; i++) check("mutation", "test-ip");
    expect(check("mutation", "test-ip").allowed).toBe(false);
  });

  it("returns correct retry_after when denied", () => {
    for (let i = 0; i < 3; i++) check("mutation", "test-ip");
    const outcome = check("mutation", "test-ip");
    expect(outcome.allowed).toBe(false);
    expect(outcome.retryAfterSec).toBeGreaterThan(0);
  });

  it("refills tokens after time passes", () => {
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) check("mutation", "test-ip", t0);
    expect(check("mutation", "test-ip", t0).allowed).toBe(false);

    // 20s later: 3 tokens / 60s * 20s = 1 token refilled
    const t1 = t0 + 20_000;
    expect(check("mutation", "test-ip", t1).allowed).toBe(true);
  });

  it("buckets are isolated per client key", () => {
    for (let i = 0; i < 3; i++) check("mutation", "ip-a");
    // ip-a exhausted; ip-b has full tokens
    expect(check("mutation", "ip-a").allowed).toBe(false);
    expect(check("mutation", "ip-b").allowed).toBe(true);
  });

  it("buckets are isolated per tier", () => {
    _setBucketConfigForTests("tmdb", { limit: 3, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) check("mutation", "shared-ip");
    expect(check("mutation", "shared-ip").allowed).toBe(false);
    expect(check("tmdb", "shared-ip").allowed).toBe(true);
  });

  it("reports remaining count correctly", () => {
    _setBucketConfigForTests("mutation", { limit: 5, windowMs: 60_000 });
    check("mutation", "ip");
    check("mutation", "ip");
    const outcome = check("mutation", "ip");
    expect(outcome.remaining).toBe(2);
  });
});

describe("rateLimit — HTTP response helper", () => {
  beforeEach(() => {
    _resetForTests();
    _setBucketConfigForTests("mutation", { limit: 2, windowMs: 60_000 });
    process.env.RATE_LIMIT_ENFORCE_IN_TESTS = "1";
  });

  afterEach(() => {
    _resetForTests();
    delete process.env.RATE_LIMIT_ENFORCE_IN_TESTS;
  });

  it("returns null when allowed", () => {
    const req = makeRequest();
    expect(rateLimit(req, "mutation")).toBeNull();
  });

  it("returns 429 Response when limit exceeded", async () => {
    const req = makeRequest();
    rateLimit(req, "mutation");
    rateLimit(req, "mutation");
    const res = rateLimit(req, "mutation");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });

  it("429 response includes Retry-After header", async () => {
    const req = makeRequest();
    rateLimit(req, "mutation");
    rateLimit(req, "mutation");
    const res = rateLimit(req, "mutation");
    expect(res!.headers.get("Retry-After")).toBeTruthy();
  });

  it("429 response includes X-RateLimit-Limit header", async () => {
    const req = makeRequest();
    rateLimit(req, "mutation");
    rateLimit(req, "mutation");
    const res = rateLimit(req, "mutation");
    expect(res!.headers.get("X-RateLimit-Limit")).toBe("2");
  });

  it("429 response body contains error and retry_after", async () => {
    const req = makeRequest();
    rateLimit(req, "mutation");
    rateLimit(req, "mutation");
    const res = rateLimit(req, "mutation")!;
    const body = await res.json() as { error: string; retry_after: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retry_after).toBeGreaterThan(0);
  });

  it("applies default limits (mutation=10, tmdb=30) when not overridden", () => {
    _resetForTests();
    const req = makeRequest();
    // Default mutation limit is 10 — 10 requests should all be allowed
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(req, "mutation")).toBeNull();
    }
    expect(rateLimit(req, "mutation")).not.toBeNull();
  });

  it("tmdb default limit allows 30 requests", () => {
    _resetForTests();
    const req = makeRequest();
    for (let i = 0; i < 30; i++) {
      expect(rateLimit(req, "tmdb")).toBeNull();
    }
    expect(rateLimit(req, "tmdb")).not.toBeNull();
  });
});
