#!/usr/bin/env bash
# Installed on the Droplet by the owner. The systemd timer serializes invocations.
set -euo pipefail
umask 077
state=/var/lib/penicillion-release
ops=/opt/penicillion/ops/droplet
repo=https://api.github.com/repos/adityaanantharaman16/Penicillion
cd "$state"
exec 9>lock
flock -n 9 || exit 0
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
api() {
  # curl strips Authorization when following a redirect to artifact storage.
  curl --config /etc/penicillion/release/github.curl -fsSL --proto '=https' \
    --proto-redir '=https' --max-time 120 "$@"
}
healthy() {
  curl -fsS --noproxy '*' --max-time 10 --resolve penicillion.io:443:127.0.0.1 \
    https://penicillion.io/health/ready | jq -e '.ready == true' >/dev/null
}
cd "$ops"
apply_image() {
  GAME_IMAGE="$1" docker compose up -d --no-deps --wait --wait-timeout 100 game
}
# A process/host interruption can occur between replacement and committing .env.
if [[ -e "$state/pending" ]]; then
  old=$(cat "$state/pending")
  apply_image "$old" && healthy || { echo 'Rollback needs operator attention.' >&2; exit 1; }
  sed -i "s|^GAME_IMAGE=.*|GAME_IMAGE=$old|" .env
  rm "$state/pending"
fi
api "$repo/actions/artifacts?name=droplet-approved&per_page=100" -o "$work/list"
# Filter by branch, newest approval first. Untrusted jobs can publish artifacts
# with the same name. A valid signature binds the run ID and exact image bytes.
jq -r '.artifacts | sort_by(.id) | reverse | .[] |
  select(.expired == false and .workflow_run.head_branch == "main") |
  [.id, .workflow_run.id] | @tsv' "$work/list" > "$work/tickets"
mapfile -t tickets < "$work/tickets"
for ticket in "${tickets[@]}"; do
  read -r ticket_id run_id <<< "$ticket"
  [[ "$ticket_id" =~ ^[0-9]+$ && "$run_id" =~ ^[0-9]+$ ]] || continue
  [[ ! -e "$state/seen-$ticket_id" ]] || continue
  api "$repo/actions/artifacts/$ticket_id/zip" --max-filesize 131072 -o "$work/ticket"
  unzip -p "$work/ticket" release > "$work/release" &&
    unzip -p "$work/ticket" release.sig > "$work/signature" &&
    openssl pkeyutl -verify -pubin -inkey /etc/penicillion/release/verify.pem \
      -rawin -in "$work/release" -sigfile "$work/signature" >/dev/null || {
        touch "$state/seen-$ticket_id"; continue;
      }
  mapfile -t fields < "$work/release"
  [[ ${#fields[@]} == 8 ]] || exit 1
  sha=${fields[0]} seq=${fields[1]} artifact=${fields[3]} checksum=${fields[4]}
  image=${fields[5]} contract=${fields[6]} expiry=${fields[7]}
  [[ "$sha" =~ ^[0-9a-f]{40}$ && "$seq" =~ ^[1-9][0-9]{0,9}$ && ${fields[2]} == "$run_id" &&
     "$artifact" =~ ^[0-9]+$ && "$checksum" =~ ^[0-9a-f]{64}$ && "$image" =~ ^sha256:[0-9a-f]{64}$ &&
     "$contract" =~ ^[0-9a-f]{64}$ && "$expiry" =~ ^[0-9]{10}$ ]] || exit 1
  last=0
  if [[ -f "$state/sequence" ]]; then read -r last < "$state/sequence"; fi
  if (( seq < last || expiry <= $(date +%s) )); then touch "$state/seen-$ticket_id"; continue; fi
  # Consume this explicit approval once. Re-running a failed job requires a fresh approval.
  touch "$state/seen-$ticket_id"
  echo "Checking approved release $sha from run $run_id"
  host_hash=$(/usr/local/lib/penicillion-release/contract.sh host "$ops" | sha256sum | cut -d' ' -f1)
  [[ "$host_hash" == "$contract" ]] || { echo 'Host configuration differs. Use the manual runbook.' >&2; exit 1; }
  api "$repo/actions/artifacts/$artifact/zip" -o "$work/image.zip"
  unzip -p "$work/image.zip" game.tar.gz > "$work/game.tar.gz"
  echo "$checksum  $work/game.tar.gz" | sha256sum --check --status
  docker load --input "$work/game.tar.gz" >/dev/null
  tag="penicillion-game:$sha-amd64"
  # Docker Engine may report the config ID or its enclosing OCI manifest.
  ids="$work/image-ids"
  python3 /usr/local/lib/penicillion-release/image-ids.py "$work/game.tar.gz" "$tag" > "$ids"
  grep -Fxq "$image" "$ids" || { echo 'Signed image ID differs from the verified archive.' >&2; exit 1; }
  local_id=$(docker image inspect -f '{{.Id}}' "$tag")
  grep -Fxq "$local_id" "$ids" || { echo 'Loaded image ID differs from the verified archive.' >&2; exit 1; }
  actual=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$tag")
  [[ "$actual" == "$local_id linux/amd64 $sha" ]] || { echo "Unexpected platform or revision: $actual" >&2; exit 1; }
  old=$(sed -n 's/^GAME_IMAGE=//p' .env)
  [[ "$old" =~ ^penicillion-game:[0-9a-f]{7,40}-amd64$ ]] || { echo 'Unknown previous image.' >&2; exit 1; }
  running=$(docker compose ps -q game)
  old_id=$(docker image inspect -f '{{.Id}}' "$old")
  docker inspect "$running" | jq -e --arg id "$old_id" --arg tag "$old" \
    '.[0] | .Config.Image == $tag and (.Image == $id or .ImageManifestDescriptor.digest == $id)' >/dev/null || {
    echo 'Running game differs from configured prior image.' >&2; exit 1;
  }
  game_contract() {
    docker run -i --rm --network none --read-only --entrypoint sh "$1" -s -- game \
      < /usr/local/lib/penicillion-release/contract.sh
  }
  game_contract "$old" > "$work/old"
  game_contract "$tag" > "$work/new"
  cmp -s "$work/old" "$work/new" || { echo 'Database or content inputs changed. Use the migration runbook.' >&2; exit 1; }
  healthy
  printf '%s\n' "$old" > "$state/pending.tmp"
  mv "$state/pending.tmp" "$state/pending"
  if apply_image "$tag" && healthy && grep -Fxq "$(docker inspect -f '{{.Image}}' "$(docker compose ps -q game)")" "$ids"; then
    sed -i "s|^GAME_IMAGE=.*|GAME_IMAGE=$tag|" .env
    echo "$seq" > "$state/sequence.tmp"
    mv "$state/sequence.tmp" "$state/sequence"
    rm "$state/pending"
    echo "Healthy at $sha. Previous image: $old"
  else
    apply_image "$old" && healthy || { echo 'Rollback needs operator attention.' >&2; exit 1; }
    rm "$state/pending"
    echo "Health check failed. Restored $old." >&2
    exit 1
  fi
  break
done
# Approval artifacts expire after a day.
find "$state" -name 'seen-*' -type f -mtime +7 -delete
