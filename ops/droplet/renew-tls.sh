#!/bin/sh
# Certbot deploy hook on the Ubuntu host. Publish only validated apex certificates.
set -eu
[ "${RENEWED_LINEAGE:?Certbot supplies the renewed lineage}" = /etc/letsencrypt/live/penicillion.io ] || exit 0
dest=/etc/penicillion/config/edge
umask 077
install -m 0600 "$RENEWED_LINEAGE/privkey.pem" "$dest/privkey.new"
install -m 0644 "$RENEWED_LINEAGE/fullchain.pem" "$dest/fullchain.new"
mv "$dest/privkey.new" "$dest/privkey.pem"
mv "$dest/fullchain.new" "$dest/fullchain.pem"
cd /opt/penicillion/ops/droplet
# First issuance happens before nginx starts. A running server reloads gracefully.
if [ -n "$(docker compose ps --status running -q edge)" ]; then
  docker compose exec -T edge nginx -t
  docker compose exec -T edge nginx -s reload
fi
