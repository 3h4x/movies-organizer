#!/bin/bash
# Backup FilmPick SQLite DB using better-sqlite3 .backup() (safe with WAL mode)
# Tiered retention: 4x15min, 4 hourly, 4 daily, 4 weekly, 4 monthly, 4 yearly

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$APP_DIR/data/movies.db"
BACKUP_DIR="$APP_DIR/data/backups"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] no database at $DB_PATH, skipping"
  exit 0
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/movies_${TIMESTAMP}.db"

cd "$APP_DIR"

node -e "
const Database = require('better-sqlite3');
const db = new Database('$DB_PATH', { readonly: true });
db.backup('$BACKUP_FILE')
  .then(() => { console.log('[backup] created $BACKUP_FILE'); db.close(); })
  .catch(err => { console.error('[backup] FAILED:', err.message); db.close(); process.exit(1); });
"

if [ $? -ne 0 ]; then
  exit 1
fi

# Tiered retention pruning
cd "$BACKUP_DIR"

KEEP_FILE=$(mktemp)
NOW=$(date +%s)

# Parse backup timestamp to epoch
file_epoch() {
  local f="$1"
  local ts="${f#movies_}"
  ts="${ts%.db}"
  local y="${ts:0:4}" m="${ts:4:2}" d="${ts:6:2}" H="${ts:9:2}" M="${ts:11:2}" S="${ts:13:2}"
  # macOS date
  date -j -f "%Y-%m-%d %H:%M:%S" "${y}-${m}-${d} ${H}:${M}:${S}" +%s 2>/dev/null || \
  date -d "${y}-${m}-${d} ${H}:${M}:${S}" +%s 2>/dev/null
}

# Collect all backups sorted newest first
ALL=()
while IFS= read -r f; do
  ALL+=("$f")
done < <(ls -1t movies_*.db 2>/dev/null)

if [ ${#ALL[@]} -eq 0 ]; then
  rm -f "$KEEP_FILE"
  echo "[backup] no backups found"
  exit 0
fi

# Tier boundaries in seconds
TIER_15M=3600       # <1h
TIER_HOURLY=86400   # <24h
TIER_DAILY=604800   # <7d
TIER_WEEKLY=2592000 # <30d
TIER_MONTHLY=31536000 # <365d

pick_tier() {
  local max_age=$1
  local min_age=$2
  local count=$3
  local picked=0

  for f in "${ALL[@]}"; do
    local ep
    ep=$(file_epoch "$f")
    [ -z "$ep" ] && continue
    local age=$((NOW - ep))
    if [ "$age" -ge "$min_age" ] && [ "$age" -lt "$max_age" ]; then
      echo "$f" >> "$KEEP_FILE"
      picked=$((picked + 1))
      [ "$picked" -ge "$count" ] && return
    fi
  done
}

pick_tier $TIER_15M 0 4
pick_tier $TIER_HOURLY $TIER_15M 4
pick_tier $TIER_DAILY $TIER_HOURLY 4
pick_tier $TIER_WEEKLY $TIER_DAILY 4
pick_tier $TIER_MONTHLY $TIER_WEEKLY 4
pick_tier 999999999 $TIER_MONTHLY 4

# Always keep the newest
echo "${ALL[0]}" >> "$KEEP_FILE"

# Delete anything not in keep list
DELETED=0
for f in "${ALL[@]}"; do
  if ! grep -qxF "$f" "$KEEP_FILE"; then
    rm -f "$f"
    DELETED=$((DELETED + 1))
  fi
done

REMAINING=$(ls -1 movies_*.db 2>/dev/null | wc -l)
rm -f "$KEEP_FILE"
echo "[backup] $REMAINING backups retained, $DELETED pruned"
