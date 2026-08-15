// tamtam inspected 2026-05-21
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ABI_MISMATCH_PATTERNS = [
  "NODE_MODULE_VERSION",
  "compiled against a different Node.js version",
  "Module did not self-register",
];

function loadBetterSqlite3() {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.close();
}

function isNativeAbiMismatch(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" && "code" in error
    ? error.code
    : undefined;

  return (
    ABI_MISMATCH_PATTERNS.some((pattern) => message.includes(pattern)) ||
    code === "ERR_DLOPEN_FAILED"
  );
}

try {
  loadBetterSqlite3();
} catch (error) {
  if (!isNativeAbiMismatch(error)) {
    throw error;
  }

  console.warn(
    "[pretest] better-sqlite3 was built for a different Node ABI; rebuilding it now.",
  );
  const result = spawnSync("pnpm", ["rebuild", "better-sqlite3"], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  loadBetterSqlite3();
}
