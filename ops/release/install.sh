#!/usr/bin/env bash
# Run on the Droplet as root from a verified checkout or transfer of this directory.
set -euo pipefail
cd "$(dirname "$0")"
for tool in docker jq openssl unzip curl flock python3; do command -v "$tool" >/dev/null || { echo "Install $tool first." >&2; exit 1; }; done
install -d -m 0700 /etc/penicillion/release
install -d -m 0755 /usr/local/lib/penicillion-release
install -m 0644 image-ids.py /usr/local/lib/penicillion-release/
install -m 0755 poll.sh contract.sh /usr/local/lib/penicillion-release/
install -m 0644 verify.pem /etc/penicillion/release/
cred=/etc/penicillion/release/github.curl
if [[ ! -s "$cred" ]]; then
  read -rs -p 'GitHub read-only Actions token: ' token
  echo
  [[ "$token" =~ ^[A-Za-z0-9_]+$ ]] || { echo 'Expected a GitHub token.' >&2; exit 1; }
  umask 077
  printf 'header = "Authorization: Bearer %s"\n' "$token" > "$cred.tmp"
  mv "$cred.tmp" "$cred"
  unset token
fi
curl --config "$cred" -fsS 'https://api.github.com/repos/adityaanantharaman16/Penicillion/actions/artifacts?per_page=1' >/dev/null
install -m 0644 penicillion-release.{timer,service} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now penicillion-release.timer
systemctl list-timers penicillion-release.timer
