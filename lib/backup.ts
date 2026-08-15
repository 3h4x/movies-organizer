// tamtam inspected 2026-05-21
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "movies.db");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");

// Tiered retention: 4 per tier
// < 1h   → keep 4  (15-min slots)
// 1h-24h → keep 4  (hourly)
// 1d-7d  → keep 4  (daily)
// 7d-30d → keep 4  (weekly)
// 30d-1y → keep 4  (monthly)
// > 1y   → keep 4  (yearly)
const TIERS = [
  { maxAge: 3_600,        minAge: 0,          keep: 4 },
  { maxAge: 86_400,       minAge: 3_600,       keep: 4 },
  { maxAge: 604_800,      minAge: 86_400,      keep: 4 },
  { maxAge: 2_592_000,    minAge: 604_800,     keep: 4 },
  { maxAge: 31_536_000,   minAge: 2_592_000,   keep: 4 },
  { maxAge: Infinity,     minAge: 31_536_000,  keep: 4 },
];

export function pruneBackups(dir: string = BACKUP_DIR) {
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  if (files.length === 0) return;

  const now = Date.now();
  const keep = new Set<string>();

  // Always keep newest
  keep.add(files[0].name);

  for (const tier of TIERS) {
    let picked = 0;
    for (const f of files) {
      const ageSec = (now - f.mtime) / 1000;
      if (ageSec >= tier.minAge && ageSec < tier.maxAge) {
        keep.add(f.name);
        if (++picked >= tier.keep) break;
      }
    }
  }

  for (const f of files) {
    if (!keep.has(f.name)) {
      try {
        fs.unlinkSync(path.join(dir, f.name));
      } catch {
        // log and continue — don't let a failed prune abort the loop
        console.error(`[backup] Failed to prune ${f.name}`);
      }
    }
  }
}

export async function backupDb(prune = true): Promise<string> {
  if (!fs.existsSync(DB_PATH)) throw new Error("Database not found");

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `filmpick-${ts}.db`;

  const db = new Database(DB_PATH, { readonly: true });
  try {
    await db.backup(path.join(BACKUP_DIR, filename));
  } finally {
    db.close();
  }

  if (prune) pruneBackups(BACKUP_DIR);

  return filename;
}

export function getBackupStats(): { lastBackup: string | null; count: number } {
  if (!fs.existsSync(BACKUP_DIR)) return { lastBackup: null, count: 0 };

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return {
    lastBackup: files[0]?.name ?? null,
    count: files.length,
  };
}
