#!/bin/sh
# Hot backup of a SQLite sole data store (default: My List). Uses sqlite3 .backup,
# not cp: the DB runs in WAL mode and most data lives in list.db-wal until checkpoint.
# Usage: backup-mylist.sh [backup_dir src_db]   (kanzo: /volume1/container_backup/kanzo /volume1/docker/kanzo/data/kanzo.db)
set -e
D=${1:-/volume1/container_backup/myprivatelist}
SRC=${2:-/volume1/docker/myprivatelist/data/list.db}
N=$(basename "$SRC" .db)
OUT="$D/$N-$(date +%F).db"
mkdir -p "$D"
sqlite3 "$SRC" ".backup '$OUT'"
[ "$(sqlite3 "$OUT" 'PRAGMA integrity_check')" = ok ]
gzip -f "$OUT"
# keep newest 4
ls -1t "$D/$N"-*.db.gz | tail -n +5 | xargs -r rm -f
echo "$(date -Iseconds) backup ok: $OUT.gz" >> "$D/backup.log"
