#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
compose=(docker compose -f compose.yaml)
db=("${compose[@]}" exec -T --user postgres db)
repo=("${compose[@]}" run --rm -T --no-deps backup)
case "${1:-}" in
  refill) "${compose[@]}" run --rm -T admin node scripts/seed.mjs ;;
  init-backup) "${repo[@]}" init ;;
  backup)
    # Dump first so restic never commits a truncated dump after a database error.
    umask 077
    dump=$(mktemp)
    trap 'rm -f "$dump"' EXIT
    "${db[@]}" pg_dump -Fc --role=night_backup -d penicillion > "$dump"
    "${repo[@]}" backup --stdin --stdin-filename penicillion.dump --host penicillion < "$dump"
    ;;
  restore-drill)
    snapshot=${2:?Supply an explicit restic snapshot ID}
    name="drill_$(date -u +%Y%m%d_%H%M%S)_$$"
    "${db[@]}" createdb -T template0 -O night_owner "$name"
    "${repo[@]}" dump "$snapshot" /penicillion.dump | "${db[@]}" pg_restore --exit-on-error --single-transaction --no-owner --role=night_owner -d "$name"
    echo "Restored isolated database $name. Compare saved outcomes and receipts before dropping it."
    ;;
  *) echo 'Choose refill, init-backup, backup or restore-drill SNAPSHOT' >&2; exit 2 ;;
esac
