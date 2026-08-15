// tamtam inspected 2026-05-21
export type RateLimitBucket = "mutation" | "tmdb";

interface BucketState {
  tokens: number;
  lastRefill: number;
}

interface BucketConfig {
  limit: number;
  windowMs: number;
}

// Mutations 10 rpm, TMDb-hitting 30 rpm (TMDb's own quota is higher; this protects our key from runaway loops).
const DEFAULTS: Record<RateLimitBucket, BucketConfig> = {
  mutation: { limit: 10, windowMs: 60_000 },
  tmdb: { limit: 30, windowMs: 60_000 },
};

const overrides: Partial<Record<RateLimitBucket, BucketConfig>> = {};

// key = `${bucket}:${clientIp}`
const buckets = new Map<string, BucketState>();

// Drop entries that have been idle longer than this so the map can't grow without bound.
const IDLE_EVICT_MS = 10 * 60_000;
let lastSweep = 0;

function sweepIfDue(now: number) {
  if (now - lastSweep < IDLE_EVICT_MS) return;
  lastSweep = now;
  for (const [k, v] of buckets) {
    if (now - v.lastRefill > IDLE_EVICT_MS) buckets.delete(k);
  }
}

function getConfig(bucket: RateLimitBucket): BucketConfig {
  return overrides[bucket] ?? DEFAULTS[bucket];
}

export function getClientIp(req: Request): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  // Next.js dev/runtime doesn't expose remote addr directly; group untrusted requests under
  // a single shared bucket so a public deploy still has a global ceiling even without proxy info.
  return "anon";
}

function pathnameOf(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "";
  }
}

export interface RateLimitOutcome {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
  limit: number;
}

export function check(
  bucket: RateLimitBucket,
  clientKey: string,
  now: number = Date.now(),
): RateLimitOutcome {
  const cfg = getConfig(bucket);
  const key = `${bucket}:${clientKey}`;
  sweepIfDue(now);
  let state = buckets.get(key);
  if (!state) {
    state = { tokens: cfg.limit, lastRefill: now };
    buckets.set(key, state);
  } else {
    const elapsed = Math.max(0, now - state.lastRefill);
    const refill = (elapsed * cfg.limit) / cfg.windowMs;
    state.tokens = Math.min(cfg.limit, state.tokens + refill);
    state.lastRefill = now;
  }
  if (state.tokens >= 1) {
    state.tokens -= 1;
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.floor(state.tokens),
      limit: cfg.limit,
    };
  }
  const needed = 1 - state.tokens;
  const msPerToken = cfg.windowMs / cfg.limit;
  const retryAfterMs = Math.ceil(needed * msPerToken);
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    remaining: 0,
    limit: cfg.limit,
  };
}

export function rateLimit(
  req: Request,
  bucket: RateLimitBucket,
): Response | null {
  // Routes are unit-tested in tight loops that would otherwise blow the bucket. Bypass under
  // Vitest unless a specific test opts in (the rate-limit tests themselves).
  if (process.env.VITEST && !process.env.RATE_LIMIT_ENFORCE_IN_TESTS) return null;
  const ip = getClientIp(req);
  const outcome = check(bucket, ip);
  if (outcome.allowed) return null;
  console.warn(
    `[rate-limit] 429 bucket=${bucket} ip=${ip} retry_after=${outcome.retryAfterSec}s path=${pathnameOf(req)}`,
  );
  return Response.json(
    { error: "rate_limited", retry_after: outcome.retryAfterSec },
    {
      status: 429,
      headers: {
        "Retry-After": String(outcome.retryAfterSec),
        "X-RateLimit-Limit": String(outcome.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

// Test-only helpers.
export function _resetForTests() {
  buckets.clear();
  lastSweep = 0;
  for (const k of Object.keys(overrides) as RateLimitBucket[]) delete overrides[k];
}

export function _setBucketConfigForTests(
  bucket: RateLimitBucket,
  cfg: BucketConfig,
) {
  overrides[bucket] = cfg;
}
