import type Database from "better-sqlite3";
import { setSetting } from "@/lib/db";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HEALTH_CHECK_TIMEOUT_MS = 15000;

// HTTP statuses that mean the CDA page is gone for good. A link in this set is
// treated as dead: kept in the table for audit, but excluded from the engine.
// Transient failures (timeouts → status 0, 5xx) are NOT dead — they get
// re-checked on the next pass and recover automatically.
export const CDA_DEAD_STATUSES = new Set([404, 410]);

// Defaults tuned so a full catalog is swept slowly without ever bursting CDA:
// a handful of links per tick, several seconds apart.
const DEFAULT_LINKS_PER_TICK = 10;
const DEFAULT_DELAY_MS = 3000;

export function isCdaLinkDead(status: number | null): boolean {
  return status !== null && CDA_DEAD_STATUSES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Probe a single CDA link. Returns the HTTP status, or 0 on a network error /
 * timeout (inconclusive — never treated as dead).
 */
export async function checkCdaLink(url: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return 0;
  }
}

interface HealthRow {
  id: number;
  cda_url: string;
  cda_last_status: number | null;
}

export interface CdaHealthPassResult {
  checked: number;
  dead: number;
  recovered: number;
}

export interface CdaHealthPassOptions {
  linksPerTick?: number;
  delayMs?: number;
  // Injectable for tests so the rate-limit gap is deterministic.
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Health-check a slow rolling batch of cached CDA links (oldest-checked first,
 * never-checked first). Marks newly-dead links, recovers links that came back,
 * and waits `delayMs` between each request so CDA is never hammered.
 */
export async function runCdaHealthCheckPass(
  db: Database.Database,
  opts: CdaHealthPassOptions = {},
): Promise<CdaHealthPassResult> {
  const limit = opts.linksPerTick ?? DEFAULT_LINKS_PER_TICK;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const wait = opts.sleep ?? sleep;

  const rows = db
    .prepare(
      `SELECT id, cda_url, cda_last_status
         FROM recommended_movies
        WHERE engine = 'cda' AND cda_url IS NOT NULL
        ORDER BY cda_last_checked_at IS NOT NULL, cda_last_checked_at ASC
        LIMIT ?`,
    )
    .all(limit) as HealthRow[];

  const update = db.prepare(
    "UPDATE recommended_movies SET cda_last_status = ?, cda_last_checked_at = ? WHERE id = ?",
  );

  let dead = 0;
  let recovered = 0;

  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && delayMs > 0) await wait(delayMs);

    const row = rows[i];
    const status = await checkCdaLink(row.cda_url);
    const now = new Date().toISOString();

    const wasDead = isCdaLinkDead(row.cda_last_status);
    const nowDead = isCdaLinkDead(status);

    update.run(status, now, row.id);

    if (nowDead && !wasDead) dead++;
    if (!nowDead && wasDead && status >= 200 && status < 400) recovered++;
  }

  const deadTotal = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM recommended_movies WHERE engine = 'cda' AND cda_last_status IN (404, 410)",
      )
      .get() as { c: number }
  ).c;

  setSetting(db, "cda_dead_link_count", String(deadTotal));
  setSetting(db, "cda_health_last_run", new Date().toISOString());

  return { checked: rows.length, dead, recovered };
}
