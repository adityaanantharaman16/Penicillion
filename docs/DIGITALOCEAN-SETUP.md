# Guided setup for the DigitalOcean Droplet

Use this document when the owner asks for help setting up Penicillion. The pilot serves Daily, Practice and Slide Relay to about 10–15 simultaneous players. It uses one self-managed Ubuntu server. Production Compose, proxy, certificate setup and backup jobs are in the [release operations guide](../ops/droplet/README.md). The root Compose file runs the local development game. [Hosting decision](HOSTING-PLAN.md) · [Game architecture](../ops/ARCHITECTURE.md)

Guide the owner through one numbered step at a time. Say which screen or terminal to use, what success looks like, and whether the next action starts billing or makes the site reachable. At the start of a new chat, check the repository revision and ask which steps the owner already completed. Record the hostname, image digest, test results, backup timestamp and next step in the handoff. The owner enters payment details, passwords, recovery codes, SSH passphrases and client secrets directly into the appropriate secure interface. Use public identifiers or redacted errors in chat.

### 1. Prepare the release locally

The x86 game image from committed gameplay revision `66beab9` was built and exercised locally at the apex using browser-only loopback resolution and a private test certificate. The Daily, Practice and two-player Relay Chromium scenarios passed. Restore and restart evidence and remaining hosted checks are in the [rehearsal record](DROPLET-REHEARSAL.md). Use the [release operations guide](../ops/droplet/README.md) to reproduce or update the candidate.

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

**Agent.** Configure and test automatic HTTPS renewal. For an IP-restricted pilot, DNS-based certificate validation allows the web firewall to stay restricted. Use narrowly scoped DNS credentials if automation needs them. Configure the proxy to pass WebSocket upgrades and preserve Host, to overwrite client-supplied forwarding headers and to set X-Real-IP from the actual peer. Set TRUST_PROXY_ADDRESS to the observed private proxy address. The existing nginx file assumes AWS networking. Verify clients cannot connect to the Node listener directly or spoof a different IP to bypass limits.

**Owner, in Google Cloud.** Select or create a project, set the Google Auth Platform branding, audience and test users for a restricted pilot, then create a Web application OAuth client. For the pilot, register `https://penicillion.io/auth/callback` under authorized redirect URIs and use `https://penicillion.io` for PUBLIC_ORIGIN. Store the client ID and secret directly in the server's protected configuration. Test both guest play and a sign-in redirect. [Google web server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server)

### 6. Configure the game and initialize data

**Agent, with the approved release.** Install the deployment files in a dedicated release directory. Keep secrets outside Git, web assets and image layers in a restricted server-side file or secret mount. Use separate database owner, backup and restricted runtime credentials. Set NODE_ENV to production, PUBLIC_ORIGIN to the exact HTTPS origin, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and SESSION_SECRET (generate at least 32 random bytes). Set the private DATABASE_URL, DATABASE_CA_PEM and REDIS_URL for authenticated TLS. Trust the private CA used for Redis in the Node runtime and test certificate verification. Use private DNS names that match the certificates. Record secret names and recovery instructions only.

Start PostgreSQL 17 on a persistent volume and Redis on a private network with bounded memory and the noeviction policy. Verify both connections with the runtime trust settings. Create the restricted night_play role. Using an administrative job identity, run the release's scripts/migrate.mjs, scripts/grants.mjs and scripts/seed.mjs in order. Record the immutable release ID and confirm today's issue and the calendar horizon. Treat local playtest data as disposable unless the owner asks for an import. Start one game worker and the proxy. Give services restart policies. Verify /health/ready returns HTTP 200 through the pilot HTTPS URL and check that ports 5432, 6379 and 4321 are unreachable externally. [Runtime grants](../ops/runtime-grants.sql) · [Database setup](../scripts/migrate.mjs) · [Daily refill](../scripts/seed.mjs)

### 7. Set up monitoring, backups and scheduled work

**Owner, in DigitalOcean.** Create an HTTPS Uptime check for the pilot's /health/ready endpoint. Choose the email recipient and sustained downtime, latency and certificate-expiry thresholds. If the pilot is restricted, permit the external monitor to reach only this health route using the chosen access design. Verify an alert and recovery in the test window. The endpoint checks Node readiness, a PostgreSQL query and the Redis client state. Add host alerts for disk space and memory. One external uptime check has a monthly credit. [Uptime checks](https://docs.digitalocean.com/products/uptime/) · [Uptime pricing](https://docs.digitalocean.com/products/uptime/details/pricing/)

**Agent.** Schedule a nightly PostgreSQL logical backup with cron or a systemd timer. Encrypt it and upload it off the Droplet with limited credentials. Signal an external monitor only after successful upload. Have it alert on a missed backup. Agree on retention and where the owner keeps the decryption key. Restore into a disposable database and confirm an actual saved run, its score and command receipt. DigitalOcean daily backups also capture the VM disk. Separately schedule scripts/seed.mjs once daily, alert on job failure or fewer than 28 future days, and confirm already-issued days stay pinned. The existing Node worker runs the Relay fuse. [DigitalOcean disk backup behavior](https://docs.digitalocean.com/products/backups/details/features/)

### 8. Playtest, then decide on public access

Play Daily and timed/untimed Practice, refresh a saved run, repeat a submission and verify the score. From separate browser sessions, play an entire private Relay game, including a pass, timeout, disconnect, reconnect and rematch. Check that a third identity cannot read private room state. Run a 30-minute mixed test at 30 simultaneous players in isolated test data and measure RAM, disk use, API latency and delivery to the other player. Reboot the VM, confirm automatic recovery and verify persisted scores. Rehearse rolling back to the previous compatible image digest with the database intact. Record how long restart and restore took. [Browser tests](../scripts/ci/) · [Earlier local capacity evidence](../evidence/load/CAPACITY.md)

Show the owner the tested revision, expected bill, alert recipient, last verified restore, any outstanding issues and how to reach the DigitalOcean recovery console. Only after separate public-launch approval should the operator broaden web access to the public. Keep SSH restricted. For later releases, verify CI, retain the prior image and back up before schema changes. For monetization, use the [future advertising plan](ADS-PLAN.md).
