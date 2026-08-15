#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
DEFAULT_TARGET="$APP_DIR/data/movies.db"

usage() {
  echo "Usage: bash scripts/restore-db.sh <backup-file> [target-path] [--force]" >&2
}

FORCE=0
BACKUP_FILE=""
TARGET_PATH=""

for arg in "$@"; do
  case "$arg" in
    --force)
      FORCE=1
      ;;
    -*)
      usage
      exit 2
      ;;
    *)
      if [ -z "$BACKUP_FILE" ]; then
        BACKUP_FILE="$arg"
      elif [ -z "$TARGET_PATH" ]; then
        TARGET_PATH="$arg"
      else
        usage
        exit 2
      fi
      ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  usage
  exit 2
fi

TARGET_PATH="${TARGET_PATH:-$DEFAULT_TARGET}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET_PATH")"

BACKUP_REAL="$(cd "$(dirname "$BACKUP_FILE")" && pwd)/$(basename "$BACKUP_FILE")"
TARGET_DIR="$(cd "$(dirname "$TARGET_PATH")" && pwd)"
TARGET_REAL="$TARGET_DIR/$(basename "$TARGET_PATH")"

if [ "$BACKUP_REAL" = "$TARGET_REAL" ]; then
  echo "[restore] backup and target are the same path" >&2
  exit 1
fi

if [ -e "$TARGET_PATH" ] && [ "$FORCE" -ne 1 ]; then
  if [ -t 0 ]; then
    printf "[restore] %s exists. Overwrite? [y/N] " "$TARGET_PATH" >&2
    read -r answer
    case "$answer" in
      y|Y|yes|YES) ;;
      *)
        echo "[restore] refused to overwrite $TARGET_PATH" >&2
        exit 1
        ;;
    esac
  else
    echo "[restore] refused to overwrite $TARGET_PATH without --force" >&2
    exit 1
  fi
fi

TMP_TARGET="$(mktemp "$TARGET_DIR/.$(basename "$TARGET_PATH").restore-tmp.XXXXXX")"
cleanup() {
  rm -f "$TMP_TARGET"
}
trap cleanup EXIT

cp "$BACKUP_FILE" "$TMP_TARGET"
node - "$TMP_TARGET" <<'NODE'
const Database = require("better-sqlite3");

const candidatePath = process.argv[2];

try {
  const db = new Database(candidatePath, { fileMustExist: true, readonly: true });
  try {
    const result = db.pragma("integrity_check", { simple: true });
    if (result !== "ok") {
      console.error(`[restore] integrity_check failed: ${result}`);
      process.exit(1);
    }
  } finally {
    db.close();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[restore] backup validation failed: ${message}`);
  process.exit(1);
}
NODE
mv "$TMP_TARGET" "$TARGET_PATH"
trap - EXIT

echo "[restore] restored $BACKUP_FILE to $TARGET_PATH"
