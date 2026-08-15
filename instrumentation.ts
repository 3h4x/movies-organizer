// tamtam inspected 2026-05-21
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { backupDb } = await import("@/lib/backup");
  const { getDb, getSetting } = await import("@/lib/db");
  const { dedupeMoviesByTmdbId } = await import("@/lib/dedup");
  const { initCdaScheduler } = await import("@/lib/cda-scheduler");
  const { initEpgScheduler } = await import("@/lib/epg-scheduler");

  const INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

  const run = async () => {
    const enabled = getSetting(getDb(), "backup_enabled");
    if (enabled === "false") return;

    try {
      const filename = await backupDb();
      console.log(`[backup] ${filename}`);
    } catch (err) {
      console.error("[backup] failed:", (err as Error).message);
    }
  };

  // Back up first so users have a pre-dedup snapshot if anything looks off.
  await run();
  const backupTimer = setInterval(run, INTERVAL_MS);
  process.once("SIGTERM", () => clearInterval(backupTimer));

  try {
    const result = dedupeMoviesByTmdbId(getDb());
    if (result.groupsMerged > 0) {
      console.log(
        `[dedup] merged ${result.groupsMerged} duplicate group(s), removed ${result.rowsRemoved} row(s)`,
      );
    }
    for (const f of result.failures) {
      console.error(`[dedup] tmdb_id=${f.tmdb_id}: ${f.error}`);
    }
  } catch (err) {
    console.error("[dedup] failed:", (err as Error).message);
  }

  initCdaScheduler(getDb());
  initEpgScheduler(getDb());
}
