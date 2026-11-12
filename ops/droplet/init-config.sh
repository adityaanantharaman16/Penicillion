#!/bin/sh
# Create a NEW private host configuration. Never overwrite active credentials.
set -eu
umask 077
target=${1:?Usage: init-config.sh /absolute/new/directory [--rehearsal]}
case "$target" in /*) ;; *) echo 'Use an absolute path' >&2; exit 2;; esac
mode=${2:-production}
case "$mode" in production|--rehearsal) ;; *) exit 2;; esac
mkdir "$target"
cd "$target"
mkdir db cache edge signer
openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj '/CN=Penicillion private CA' -keyout signer/ca.key -out ca.crt 2>/dev/null
issue() {
  service=$1
  hostname=$2
  openssl req -new -newkey rsa:2048 -nodes -subj "/CN=$hostname" -keyout "$service/key" -out "$service/request" 2>/dev/null
  printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$hostname" > "$service/extensions"
  openssl x509 -req -days 365 -in "$service/request" -CA ca.crt -CAkey signer/ca.key -CAcreateserial -extfile "$service/extensions" -out "$service/cert" 2>/dev/null
}
issue db db
issue cache cache
cp ca.crt cache/ca.crt
# postgres runs as an unprivileged container user and reads the public certificate.
chmod 755 db
chmod 644 db/cert ca.crt
openssl rand -hex 32 > postgres
runtime=$(openssl rand -hex 32)
owner=$(openssl rand -hex 32)
redis=$(openssl rand -hex 32)
session=$(openssl rand -hex 48)
cat > roles.sql <<SQL
CREATE ROLE night_owner LOGIN PASSWORD '$owner';
CREATE ROLE night_play LOGIN PASSWORD '$runtime';
CREATE ROLE night_backup NOLOGIN;
GRANT pg_read_all_data TO night_backup;
ALTER DATABASE penicillion OWNER TO night_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
# The initial database setup runs under the container's postgres user.
chmod 644 roles.sql postgres
printf 'user default on #%s ~* &* +@all -@admin -@dangerous +eval +publish +subscribe\n' "$(printf %s "$redis" | openssl dgst -sha256 | awk '{print $NF}')" > cache/users.acl
printf 'DATABASE_URL=postgresql://night_owner:%s@db/penicillion\n' "$owner" > owner.env
client_id=REPLACE_BEFORE_START
client_secret=REPLACE_BEFORE_START
if [ "$mode" = --rehearsal ]; then
  issue edge penicillion.io
  mv edge/cert edge/fullchain.pem
  mv edge/key edge/privkey.pem
  client_id=rehearsal.apps.googleusercontent.com
  client_secret=$(openssl rand -hex 32)
fi
cat > game.env <<ENV
DATABASE_URL=postgresql://night_play:$runtime@db/penicillion
REDIS_URL=rediss://default:$redis@cache:6379
SESSION_SECRET=$session
OIDC_CLIENT_ID=$client_id
OIDC_CLIENT_SECRET=$client_secret
ENV
printf 'RESTIC_PASSWORD=%s\n' "$(openssl rand -hex 32)" > backup.env
if [ "$mode" = --rehearsal ]; then
  echo 'RESTIC_REPOSITORY=/rehearsal' >> backup.env
fi
echo 'Private configuration created. Store the CA signing key and recovery credentials securely.'
