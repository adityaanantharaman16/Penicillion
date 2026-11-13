#!/usr/bin/env bash
# Runs only on a fresh GitHub AMD64 runner; exercise the installed host script
# with real Docker/HTTPS and a local stand-in for GitHub artifact downloads.
set -euo pipefail
work=$(mktemp -d)
ops=/opt/penicillion/ops/droplet
state=/var/lib/penicillion-release
[[ ! -e "$ops" && ! -e "$state" && ! -e /etc/penicillion ]]
mkdir -p "$ops" "$state" /etc/penicillion/release /usr/local/lib/penicillion-release "$work/bin"
cp ops/droplet/{compose.yaml,nginx.conf,pg_hba.conf} "$ops"
cp ops/release/{poll.sh,contract.sh} /usr/local/lib/penicillion-release/
openssl genpkey -algorithm ED25519 -out "$work/test-key"
openssl pkey -in "$work/test-key" -pubout -out /etc/penicillion/release/verify.pem
export FIXTURE="$work"
tag="penicillion-game:$GITHUB_SHA-amd64"
old=penicillion-game:0000000-amd64
printf 'FROM %s\nLABEL rehearsal=previous\n' "$tag" | docker build -t "$old" -
cat > "$ops/.env" <<ENV
GAME_IMAGE=$old
CONFIG_DIR=$CONFIG_DIR
HTTPS_BIND=127.0.0.1
HTTPS_PORT=443
ENV
export CURL_CA_BUNDLE="$CONFIG_DIR/ca.crt"
docker compose -f "$ops/compose.yaml" up -d --wait game
cat > "$work/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -eu
case "$*" in
  *'/actions/artifacts?name='*) file=list ;;
  *'/actions/artifacts/1/zip'*) file=ticket.zip ;;
  *'/actions/artifacts/2/zip'*) file=image.zip ;;
  *) if [[ -f "$FIXTURE/fail-on-new" && "$(docker inspect -f '{{.Config.Image}}' release-test-game-1)" == "penicillion-game:$GITHUB_SHA-amd64" ]]; then exit 22; fi
     exec /usr/bin/curl "$@" ;;
esac
while [[ "$1" != -o ]]; do shift; done
cp "$FIXTURE/$file" "$2"
CURL
chmod +x "$work/bin/curl"
export PATH="$work/bin:$PATH"
poll=/usr/local/lib/penicillion-release/poll.sh
archive="$RUNNER_TEMP/amd64/game.tar.gz"
(cd "$(dirname "$archive")" && zip -0q "$work/image.zip" game.tar.gz)
printf '%s\n' "$GITHUB_SHA" 10 100 2 "$(sha256sum "$archive" | cut -d' ' -f1)" \
  "$(docker image inspect -f '{{.Id}}' "$tag")" "$(ops/release/contract.sh host "$ops" | sha256sum | cut -d' ' -f1)" \
  "$(($(date +%s)+600))" > "$work/release"
echo '{"artifacts":[{"id":1,"expired":false,"workflow_run":{"head_branch":"main","id":100}}]}' > "$work/list"
echo invalid > "$work/release.sig"
bundle_ticket() { (cd "$work" && rm -f ticket.zip && zip -q ticket.zip release release.sig); }
bundle_ticket
"$poll"
grep -Fxq "GAME_IMAGE=$old" "$ops/.env"
[[ -f "$state/seen-1" && ! -e "$state/sequence" ]]
rm "$state/seen-1"
openssl pkeyutl -sign -rawin -inkey "$work/test-key" -in "$work/release" -out "$work/release.sig"
bundle_ticket
touch "$work/fail-on-new"
if "$poll"; then echo 'Expected failed health check' >&2; exit 1; fi
[[ ! -e "$state/pending" && "$(docker inspect -f '{{.Config.Image}}' release-test-game-1)" == "$old" ]]
rm "$work/fail-on-new" "$state/seen-1"
"$poll"
grep -Fxq "GAME_IMAGE=$tag" "$ops/.env"
[[ "$(cat "$state/sequence")" == 10 && ! -e "$state/pending" ]]
