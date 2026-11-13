# Guided setup for the DigitalOcean Droplet

Use this document when the owner asks for help setting up Penicillion. The pilot serves Daily, Practice and Slide Relay to about 10–15 simultaneous players. It uses one self-managed Ubuntu server. Production Compose, proxy, certificate setup and backup jobs are in the [release operations guide](../ops/droplet/README.md). The root Compose file runs the local development game. [Hosting decision](HOSTING-PLAN.md) · [Game architecture](../ops/ARCHITECTURE.md)

Guide the owner through one numbered step at a time. Say which screen or terminal to use, what success looks like, and whether the next action starts billing or makes the site reachable. At the start of a new chat, compare the checkpoint below with the current repository revision and confirm any subsequent progress. Record the hostname, image digest, test results, backup timestamp and next step in the handoff. The owner enters payment details, passwords, recovery codes, SSH passphrases and client secrets directly into the appropriate secure interface. Use public identifiers or redacted errors in chat.

### Where to resume · 12 November 2026

| Item | Last confirmed |
| --- | --- |
| Host | Owner created `penicillion-pilot-01` on DigitalOcean, Ubuntu 24.04 LTS x86-64, quoted $15.60/month including daily Droplet backups. The owner uses Google sign-in for the DigitalOcean account. Look up the current public IPv4 in the control panel. |
| Admin access | Cloud Firewall attached with SSH restricted to the owner's IPv4. Mac key `~/.ssh/penicillion_do`, server user `aditya`. The owner tested sudo and a fresh key login after reloading the hardened SSH configuration, updated Ubuntu, installed Docker Engine and Compose, and ran hello-world. |
| Release | Both archives of `1472373501abf450512dd989abe27538f36cc9e9` passed SHA-256 checks on the host. The owner loaded `penicillion-game:1472373-amd64` and confirmed its revision. GitHub main may advance independently of that staged image. |
| Files | Mac bundle in repo-local `.local/droplet-release-1472373/`; Droplet upload in `~/penicillion-release-1472373/`. Installed Compose files in `/opt/penicillion/ops/droplet`; generated private config under `/etc/penicillion/config`. The owner reported that Compose validated with the jobs and backup profiles. Settings used loopback HTTPS on port 8443. |
| Next owner step | Create the Google web client and replace the two placeholders using the [login steps below](#google-sign-in). Credential entry, real callback and game startup are pending confirmation. |
| Release boundary | The owner requested separate approval for deployment, DNS changes (including certificate-verification TXT records), and additional paid resources. Tester access, public launch, actual host capacity, off-host restore and alerts are pending. |

When updating this checkpoint, record the date, staged game commit and result of each hosted check. Keep private IP allowlists, credential values, cookies, and callback query strings out of the handoff. Use the Droplet's SSH terminal for server commands. Use a separate local Mac terminal for `scp` from the workspace.

### 1. Prepare the release locally

The staged x86 release is 1472373. Its packaged game passed nine desktop and mobile Chromium tests and the HTTPS readiness check locally. The earlier 66beab9 rehearsal also exercised restore and restart. Check the [rehearsal record](DROPLET-REHEARSAL.md) before attributing a result to either revision. Use the [release operations guide](../ops/droplet/README.md) when packaging a newer game commit.

### 2. Create the account and prepare an SSH key

**Owner, in the browser.** Create or sign in to DigitalOcean, verify the email address, add billing information under Billing and enable two-factor authentication. Save recovery codes in your password manager. In the control panel, create a project named Penicillion and configure a billing alert at a monthly amount you choose. An alert is a notification, not a spending cap. The owner registered penicillion.io with Cloudflare Registrar. Verify the registrant email if Cloudflare requests it. DNS is managed in Cloudflare. The selected game origin is https://penicillion.io, including during the restricted pilot. [Cloudflare registration and nameservers](https://developers.cloudflare.com/registrar/get-started/register-domain/) [DigitalOcean accounts and 2FA](https://docs.digitalocean.com/platform/accounts/2fa/) · [Billing alerts](https://docs.digitalocean.com/platform/billing/billing-alerts/)

**Owner, in Terminal on the Mac.** Use a dedicated SSH key if you already have one. Otherwise check that the proposed filename is unused, then run the command below, choosing a passphrase. Copy the single line from the public half. Add it to DigitalOcean under Settings → Security → SSH Keys, or in the Droplet creation form. Keep the file without the .pub suffix on your Mac.

```sh
ssh-keygen -t ed25519 -f ~/.ssh/penicillion_do -C penicillion-pilot
pbcopy < ~/.ssh/penicillion_do.pub
```

### 3. Create the host and restrict incoming traffic

**Agent and owner.** Confirm the region near the pilot players, server architecture, live quote and backup selection. The planning figure is $15.60/month for one $12 Basic Droplet with 2 GiB RAM plus daily image backups. Domain and independent backup storage are separate. Obtain the owner's spend approval before clicking Create. A powered-off allocated Droplet still incurs charges. [Create a Droplet](https://docs.digitalocean.com/products/droplets/how-to/create/) · [Droplet pricing](https://docs.digitalocean.com/products/droplets/details/pricing/)

**Owner, in the control panel.** Prepare a Cloud Firewall in Networking → Firewalls. Use a dedicated tag such as penicillion-pilot as its target. Start with inbound TCP 22 from your current public IP only and allow outbound connections. Create → Droplets, select a nearby region, Ubuntu 24.04 LTS, Basic shared CPU, regular 2 GiB plan, SSH key authentication, daily backups and monitoring. Set the hostname, choose the project, and apply the matching tag. Confirm firewall attachment and copy the public IPv4 address. For a restricted pilot, allow HTTPS only from approved tester addresses or use an authenticated gateway. Confirm the exposure and source restrictions before inviting testers. SSH, PostgreSQL, Redis and Node admin ports must never be opened broadly. [Cloud Firewall setup](https://docs.digitalocean.com/products/networking/firewalls/how-to/create/)

### 4. Log in, secure the host and install Docker

**Owner and agent, from the Mac.** Obtain the server SSH host key fingerprint through the trusted DigitalOcean console (for Ed25519, run ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub on the server). Compare it on first connection. Replace DROPLET_IP below with the assigned address. If SSH times out, check the firewall's source address before changing any SSH settings. [Connect with SSH](https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/)

```sh
ssh -i ~/.ssh/penicillion_do root@DROPLET_IP
```

**On the Droplet.** Update Ubuntu packages, create a named admin user with sudo, and install the authorized public key for that user with the correct ownership and SSH permissions. Test a second terminal login and sudo while the original session is open. Then disable SSH password authentication and direct root login, validate the SSH configuration and reload it. Install Docker Engine and the Compose plugin using Docker's Ubuntu apt repository. Enable Docker at boot, configure log rotation and review automated security updates and reboot timing. Check docker compose version, disk space, memory and CPU architecture. Use sudo for Docker or explicitly treat Docker group membership as root-level access. [Docker installation and firewall behavior](https://docs.docker.com/engine/install/ubuntu/)

### 5. Set up the domain, TLS and Google login

**Owner, in Cloudflare.** After the Droplet has a public IP and pilot DNS changes are approved, select penicillion.io → DNS → Records. Review current apex records, then add or update the A record named @ for penicillion.io to point to that IPv4 address. Use DNS only for the initial IP-restricted pilot so the Droplet firewall sees tester IPs directly. Verify with `dig +short penicillion.io A` on the Mac. Add AAAA only after verifying IPv6 connectivity and firewall rules. Keep tester access restricted at the firewall until public launch approval. If enabling the Cloudflare proxy later, revisit tester access, trusted client IP handling, origin TLS and Relay WebSocket tests. [Cloudflare proxy status](https://developers.cloudflare.com/dns/proxy-status/)

**Agent.** Configure and test automatic HTTPS renewal. For an IP-restricted pilot, DNS-based certificate validation allows the web firewall to stay restricted. Use narrowly scoped DNS credentials if automation needs them. Configure the proxy to pass WebSocket upgrades and preserve Host, to overwrite client-supplied forwarding headers and to set X-Real-IP from the actual peer. The [Droplet nginx configuration](../ops/droplet/nginx.conf) forwards to the game on loopback in their shared network namespace. Compose sets TRUST_PROXY_ADDRESS to 127.0.0.1. Verify clients cannot connect to the Node listener directly or spoof a different IP to bypass limits.

#### Google sign-in

This step can be completed before DNS changes. The live callback test needs an approved deployment reachable by the tester's browser over trusted HTTPS at the exact apex origin.

1. **Owner, in Google Cloud Console.** Select or create the Penicillion project. Open Google Auth Platform → Overview → Get started if the project is new. Set app name **Penicillion**, select a monitored support email, choose **External** for personal Google accounts, and provide a developer contact. Keep the pilot in **Testing**. Under Branding, use `penicillion.io` if asked for an authorized domain. If Google asks for DNS ownership verification, review the exact record with the owner first. Under Audience, add the owner's pilot Google account as a test user if offered. Use the firewall to restrict the pilot; Google provides a basic sign-in exception to test-user restrictions. [Google Auth Platform](https://console.cloud.google.com/auth/overview) · [Audience settings](https://support.google.com/cloud/answer/15549945)
2. **Clients → Create client → Web application.** Use a descriptive name such as **Penicillion pilot web**. Leave Authorized JavaScript origins empty for the existing server-side code flow. Add exactly `https://penicillion.io/auth/callback` under **Authorized redirect URIs**, with no final slash. Create the client. Save its client ID and full secret at creation in the owner's password manager. [Google client management](https://support.google.com/cloud/answer/15549257) · [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
3. **Owner, in the Droplet SSH tab.** Run `sudo nano /etc/penicillion/config/game.env`. Replace only the values after `OIDC_CLIENT_ID=` and `OIDC_CLIENT_SECRET=`, one per line. Preserve the generated database, Redis and session settings. Save with Ctrl+O, Enter, then Ctrl+X. Keep the editor private while pasting. The neighboring Compose `.env` contains non-secret release settings. The initializer has already run.
4. **Check without displaying values.** Run the following in the Droplet SSH tab. It checks for a single Google client ID and a single populated secret, then validates Compose. This confirms configuration on disk. Google verifies the pair during the real code exchange.

```sh
cd /opt/penicillion/ops/droplet &&
sudo chmod 600 /etc/penicillion/config/game.env &&
sudo awk '
  /^OIDC_CLIENT_ID=/ { ids++; if ($0 ~ /^OIDC_CLIENT_ID=[^[:space:]]+\.apps\.googleusercontent\.com$/) id_ok++ }
  /^OIDC_CLIENT_SECRET=/ { secrets++; if ($0 ~ /^OIDC_CLIENT_SECRET=[^[:space:]]+$/ && $0 !~ /REPLACE_BEFORE_START/) secret_ok++ }
  END { if (ids == 1 && id_ok == 1 && secrets == 1 && secret_ok == 1) print "Google settings present"; else { print "Check the two Google settings"; exit 1 } }
' /etc/penicillion/config/game.env &&
sudo docker compose --profile jobs --profile backup config --quiet &&
echo "Compose configuration valid"
```

**During hosted verification.** Build 1472373 requests only `openid` and identifies an account by validated issuer and subject. Google's current parameter reference documents `openid` plus `email` or `profile`. Treat provider compatibility as unverified. If Google rejects the scope, capture the error name, reconcile the minimum scope in the server's authorization request, review the privacy implications, and test a new image. Editing consent-screen settings alone does not change the outgoing request. [Identity code](../server/identity.mjs) · [Google parameter reference](https://developers.google.com/identity/openid-connect/reference)

Once launch of the restricted pilot, TLS and DNS are approved and configured, start the services using the [release commands](../ops/droplet/README.md). From an allowed browser, play as a guest, open Account, start Google sign-in, select the pilot account, and check the return to Penicillion. Reload, confirm the same account and guest-history import choice, sign out and sign in again. For `redirect_uri_mismatch`, compare the exact Google client and redirect URI. For `invalid_client`, recheck the paired secret on the host. After a credential change on a running host, recreate the game container with the updated environment. Share only the error name and outcome. Record the tested game revision and date here.

### 6. Configure the game and initialize data

**Agent, with the approved release.** Install the deployment files in a dedicated release directory. Keep secrets outside Git, web assets and image layers in a restricted server-side file or secret mount. Use separate database owner, backup and restricted runtime credentials. Set NODE_ENV to production, PUBLIC_ORIGIN to the exact HTTPS origin, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and SESSION_SECRET (generate at least 32 random bytes). Set the private DATABASE_URL, DATABASE_CA_PEM and REDIS_URL for authenticated TLS. Trust the private CA used for Redis in the Node runtime and test certificate verification. Use private DNS names that match the certificates. Record secret names and recovery instructions only.

Start PostgreSQL 17 on a persistent volume and Redis on a private network with bounded memory and the noeviction policy. Verify both connections with the runtime trust settings. Create the restricted night_play role. Using an administrative job identity, run the release's scripts/migrate.mjs, scripts/grants.mjs and scripts/seed.mjs in order. Record the immutable release ID and confirm today's issue and the calendar horizon. Treat local playtest data as disposable unless the owner asks for an import. Start one game worker and the proxy. Give services restart policies. Verify /health/ready returns HTTP 200 through the pilot HTTPS URL and check that ports 5432, 6379 and 4321 are unreachable externally. [Runtime grants](../ops/runtime-grants.sql) · [Database setup](../scripts/migrate.mjs) · [Daily refill](../scripts/seed.mjs)

### 7. Set up monitoring, backups and scheduled work

**Owner, in DigitalOcean.** Create an HTTPS Uptime check for the pilot's /health/ready endpoint. Choose the email recipient and sustained downtime, latency and certificate-expiry thresholds. If the pilot is restricted, permit the external monitor to reach only this health route using the chosen access design. Verify an alert and recovery in the test window. The endpoint checks Node readiness, a PostgreSQL query and the Redis client state. Add host alerts for disk space and memory. One external uptime check has a monthly credit. [Uptime checks](https://docs.digitalocean.com/products/uptime/) · [Uptime pricing](https://docs.digitalocean.com/products/uptime/details/pricing/)

**Agent.** Schedule a nightly PostgreSQL logical backup with cron or a systemd timer. Encrypt it and upload it off the Droplet with limited credentials. Signal an external monitor only after successful upload. Have it alert on a missed backup. Agree on retention and where the owner keeps the decryption key. Restore into a disposable database and confirm an actual saved run, its score and command receipt. DigitalOcean daily backups also capture the VM disk. Separately schedule scripts/seed.mjs once daily, alert on job failure or fewer than 28 future days, and confirm already-issued days stay pinned. The existing Node worker runs the Relay fuse. [DigitalOcean disk backup behavior](https://docs.digitalocean.com/products/backups/details/features/)

### 8. Playtest, then decide on public access

Play Daily and timed/untimed Practice, refresh a saved run, repeat a submission and verify the score. From separate browser sessions, play an entire private Relay game, including a pass, timeout, disconnect, reconnect and rematch. Check that a third identity cannot read private room state. Run a 30-minute mixed test at 30 simultaneous players in isolated test data and measure RAM, disk use, API latency and delivery to the other player. Reboot the VM, confirm automatic recovery and verify persisted scores. Rehearse rolling back to the previous compatible image digest with the database intact. Record how long restart and restore took. [Browser tests](../scripts/ci/) · [Earlier local capacity evidence](../evidence/load/CAPACITY.md)

Show the owner the tested revision, expected bill, alert recipient, last verified restore, any outstanding issues and how to reach the DigitalOcean recovery console. Only after separate public-launch approval should the operator broaden web access to the public. Keep SSH restricted. For later releases, verify CI, retain the prior image and back up before schema changes. For monetization, use the [future advertising plan](ADS-PLAN.md).
