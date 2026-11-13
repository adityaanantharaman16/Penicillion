# Droplet release operations

Use the [owner walkthrough](../../docs/DIGITALOCEAN-SETUP.md) for account setup, cost and firewall choices. These commands assume an approved Ubuntu x86 host, a verified release in /opt/penicillion, a firewall with restricted SSH and a root shell. The runtime uses the apex https://penicillion.io. Compose publishes only HTTPS. PostgreSQL and Redis accept authenticated TLS from the private Docker network. The game shares the edge network namespace and listens on loopback. The proxy replaces untrusted client IP headers and forwards WebSocket upgrades.

### Prepare and transfer the image

The game image is built from the committed production target. On the build machine, select a clean commit. The following Bash commands save a checksummed, single-platform image. Record its image ID. Bundle the ops files from the matching **deployment configuration revision** separately. Uncommitted UI changes need a new release build and playtest once they land.

```bash
set -euo pipefail
revision=$(git rev-parse HEAD)
tag="penicillion-game:${revision:0:7}-amd64"
git archive "$revision" | docker buildx build --platform linux/amd64 --target production --load -t "$tag" -
docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$tag"
docker save "$tag" | gzip -1 > penicillion-game.tar.gz
shasum -a 256 penicillion-game.tar.gz > SHA256SUMS
```

After provisioning approval, transfer the image archive, checksum and tracked deployment files over verified SSH. Compare the expected checksum against a trusted copy, run sha256sum -c SHA256SUMS and docker load -i penicillion-game.tar.gz. Verify the loaded image ID and architecture. The other service images are pinned by digest and pulled by Docker.

### Prepare private configuration

Create /etc/penicillion with permissions 0700. From /opt/penicillion/ops/droplet run ./init-config.sh /etc/penicillion/config once. It refuses an existing target. Keep this directory outside the repo. It creates distinct PostgreSQL owner and game role credentials, Redis authentication, a session secret and a private CA. Store encrypted recovery copies of the config and CA signing key separately. Restrict host access to Docker administrators. Database bootstrap SQL and password files are readable by the container's postgres UID inside a host directory accessible only to the operator. The runtime receives only its own credentials. Track internal certificate expiry and renew using the retained private CA before the one-year leaf validity ends.

Follow the [Google sign-in walkthrough](../../docs/DIGITALOCEAN-SETUP.md#google-sign-in) to register the client, edit game.env and check the placeholders privately. The registered redirect is https://penicillion.io/auth/callback. In backup.env, configure a dedicated off-host restic repository such as an S3-compatible bucket, its scoped credentials, and the generated encryption password. Store a separate recovery copy of that password. Obtain approval for any paid storage.

Create /opt/penicillion/ops/droplet/.env with the non-secret release settings below, using the actual loaded image tag. The Compose defaults bind to loopback. Bind the public interface only after attaching and checking the approved pilot firewall.

```dotenv
GAME_IMAGE=penicillion-game:1472373-amd64
CONFIG_DIR=/etc/penicillion/config
HTTPS_BIND=127.0.0.1
HTTPS_PORT=8443
```

### Enable HTTPS after DNS approval

For the shareable public pilot, set HTTPS_BIND to 0.0.0.0 and HTTPS_PORT to 443. Start the stack and verify readiness locally with curl --resolve penicillion.io:443:127.0.0.1 https://penicillion.io/health/ready before allowing TCP 443 from All IPv4 in the DigitalOcean firewall. Keep SSH restricted. Create the approved Cloudflare DNS-only apex A record. Use a public TLS certificate for penicillion.io. Use Certbot's Cloudflare DNS challenge plugin so port 80 can stay closed. Creating its TXT challenge is a DNS change. Store its zone-restricted API token in a root-only credentials file outside the checkout. Install renew-tls.sh as an executable Certbot deploy hook. Request the certificate with the lineage name penicillion.io. The hook copies the key and chain into /etc/penicillion/config/edge and reloads a running proxy. Verify scheduled renewal with certbot renew --dry-run. Confirm HTTPS from an independent network. For later updates see the [hosted feature release guide](../../docs/HOSTED-SITE.md). [Cloudflare DNS plugin](https://certbot-dns-cloudflare.readthedocs.io/en/stable/)

### Start and maintain the pilot

Run from /opt/penicillion/ops/droplet. The db container initializes roles only on an empty data volume. On subsequent releases, use the existing private config and migrate in place after a verified backup.

```sh
docker compose up -d --wait db cache
docker compose run --rm -T admin
docker compose up -d --wait game
curl --fail --show-error https://penicillion.io/health/ready
```

For a fresh, authorized backup destination run ./db-jobs.sh init-backup. Run ./db-jobs.sh backup and retain the returned snapshot ID. Run ./db-jobs.sh restore-drill SNAPSHOT_ID. It creates a new database in the local cluster and restores the archive in one transaction. Check saved outcomes and command receipts before removing that drill database. For host-loss recovery install the same release on an isolated replacement, recover secrets and roles first, restore into a fresh database and verify it before promoting it. Test regularly. Decide retention and pruning based on measured size and recovery requirements.

Run ./db-jobs.sh refill and confirm the calendar advances. Install penicillion.cron under /etc/cron.d as root with mode 0644 after both jobs pass. Configure the external missed-backup alert with the expected daily schedule. Put its success URL and curl options fail, silent, show-error and max-time in a mode-0600 /etc/penicillion/backup-heartbeat.curl file. The cron job signals it after a successful database dump and encrypted upload. Verify cron runs and the alert recipient receives a test. Enable an external /health/ready monitor and disk/memory alerts. Retain compatible previous image tags and backups before upgrades. To roll back application files, select the previous verified tag in .env and recreate the game after confirming database compatibility.

### Repeat a local rehearsal

Use a separate Compose project name and a new private config directory outside the repo. Generate it with init-config.sh ABSOLUTE_NEW_DIRECTORY --rehearsal. This creates a disposable apex certificate, synthetic sign-in settings and a local encrypted backup target. Set CONFIG_DIR and GAME_IMAGE, HTTPS_BIND=127.0.0.1 and HTTPS_PORT=18443. Use the startup commands above. To query local HTTPS without changing DNS:

```sh
curl --noproxy '*' --connect-to penicillion.io:443:127.0.0.1:18443 --cacert "$CONFIG_DIR/ca.crt" https://penicillion.io/health/ready
```

The browser rehearsal uses Chromium with the hostname mapped to 127.0.0.1:18443 and the test certificate's public key pinned for that browser only. A real Google OAuth callback, public certificate renewal, off-host restore and a physical host reboot need validation in the approved pilot. Stop the isolated project with docker compose down. Retain or explicitly dispose of rehearsal volumes and test secrets according to the operator's needs.
