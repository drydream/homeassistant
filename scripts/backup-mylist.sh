#!/bin/sh
# Hot backup of My List SQLite (sole data store). Uses sqlite3 .backup, not cp:
# the DB runs in WAL mode and most data lives in list.db-wal until checkpoint.
set -e
D=/volume1/container_backup/myprivatelist
SRC=/volume1/docker/myprivatelist/data/list.db
OUT="$D/list-$(date +%F).db"
mkdir -p "$D"
sqlite3 "$SRC" ".backup '$OUT'"
[ "$(sqlite3 "$OUT" 'PRAGMA integrity_check')" = ok ]
gzip -f "$OUT"
# keep newest 4
ls -1t "$D"/list-*.db.gz | tail -n +5 | xargs -r rm -f
echo "$(date -Iseconds) backup ok: $OUT.gz" >> "$D/backup.log"
