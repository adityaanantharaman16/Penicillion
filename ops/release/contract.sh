#!/bin/sh
# Hash only the inputs which app-only promotion expects to stay compatible.
set -eu
case "${1:-}" in
  host)
    cd "${2:?Droplet operations directory required}"
    sha256sum compose.yaml nginx.conf pg_hba.conf ;;
  game)
    cd /game
    files=$(find server -name '*.sql' | LC_ALL=C sort)
    for file in $files; do sha256sum "$file"; done
    sha256sum ops/runtime-grants.sql scripts/migrate.mjs scripts/grants.mjs scripts/seed.mjs scripts/publish.mjs \
      server/solo/seed.mjs content/release.json content/schedule.mjs ;;
  *) exit 2 ;;
esac
