# Deploy an approved AMD64 game update

On a push to main, **Game verification** runs the tests, builds a native AMD64 production image, starts it with disposable PostgreSQL, Redis and nginx, checks its HTTPS readiness and stores that exact image for seven days. Open the desired [Actions run](https://github.com/adityaanantharaman16/Penicillion/actions/workflows/local-checks.yml), check the commit and AMD64 job, then choose **Review deployments → production → Approve and deploy**. This works for app-only feature releases after the one-time installation below. An unapproved candidate can be left waiting. For an expired image, re-run all jobs to build a fresh candidate and review it again.

Only adityaanantharaman16 is a required reviewer of production, administrator bypass is disabled and only the main branch can deploy. Self-review is allowed so the owner can ship their own feature. A PR, fork, tag or ordinary manual CI run cannot reach the release job. GitHub holds the Ed25519 signing key in the production environment. Only the approval job can use it on this release path. Never approve changes to this workflow or the app image you have not reviewed. [Workflow](../.github/workflows/local-checks.yml) · [Environment settings](https://github.com/adityaanantharaman16/Penicillion/settings/environments)

## One-time installation on the existing Droplet

1. In GitHub, create a fine-grained personal access token for **adityaanantharaman16 → Only select repositories → Penicillion**. Under repository permissions choose **Actions: Read-only** (GitHub also includes read-only metadata). Choose an expiry and record a rotation reminder. Use the token only at the installer prompt. [Token settings](https://github.com/settings/personal-access-tokens/new)
2. In the **Mac repo terminal**, choose the reviewed setup commit, for example the full SHA of the commit introducing this guide. Transfer just the release directory over the existing verified SSH connection. Replace SETUP_COMMIT with that SHA.

   ```bash
   git archive --format=tar.gz -o /tmp/penicillion-release-tools.tar.gz SETUP_COMMIT ops/release &&
   scp -o IdentitiesOnly=yes -i ~/.ssh/penicillion_do /tmp/penicillion-release-tools.tar.gz aditya@142.93.57.64:
   ```

3. In the **Droplet SSH terminal**, run the block below. Paste the read-only token when prompted. The installer stores it root-only, installs the public verification key, and starts an outbound systemd timer. The timer can pick up a signed approval issued in the previous ten minutes.

   ```bash
   sudo apt-get update && sudo apt-get install -y jq unzip &&
   tools_dir=$(mktemp -d) &&
   tar -xzf ~/penicillion-release-tools.tar.gz -C "$tools_dir" &&
   sudo bash "$tools_dir/ops/release/install.sh"
   ```

4. Check `sudo systemctl list-timers penicillion-release.timer` and `sudo journalctl -u penicillion-release -n 20 --no-pager`. The first end-to-end production check is the first release the owner approves. The Actions job waits for the exact healthy commit on the public URL. Playtest the changed feature and a Relay handoff after deployment.

## How delivery and recovery work

The Droplet periodically checks GitHub using outbound HTTPS. It verifies the signed approval, its expiry, run identity, sequence, image checksum, image ID, architecture and revision. It compares database and content inputs in the previous and candidate images and checks the installed Compose, nginx and PostgreSQL network configuration. A mismatch requires the [manual migration or infrastructure procedure](HOSTED-SITE.md#manual-release-and-recovery). Review compatibility for changes to API behavior, secrets and external services as part of reviewing the feature.

The worker updates only the game container. It records the prior image before replacing the container, checks local HTTPS and persists the new tag after health passes. A failed check restores the previous image. An interrupted switch is recovered on the next timer tick. Existing Relay sockets disconnect briefly and deadlines continue. GitHub reports success after the public readiness endpoint reports the approved SHA. If that public check times out, inspect the host log and the actual running revision before retrying. Poller rollback covers host startup/health failures. Network failures during the public check may leave a healthy new image running.

Release candidates and signed approvals contain no production credentials. Treat build artifacts and the corpus committed to this public repo as accessible to readers. Host secrets, database contents and player data stay on the Droplet. Use the root-only curl config at `/etc/penicillion/release/github.curl` to rotate the host's read token. To pause promotion, stop the timer and any active service with `sudo systemctl stop penicillion-release.timer penicillion-release.service`. Check for an interrupted switch before manual recovery. To rotate the signing key, pause the timer, replace the protected GitHub environment secret and trusted host public key as a pair, then restart the timer. Keep older images available for rollback and monitor disk space.

## First release handoff

On 12 November 2026, [run 43355233930](https://github.com/adityaanantharaman16/Penicillion/actions/runs/43355233930) passed the game and browser tests and the AMD64 rehearsal for `918b4932a7d24fe17ed81414b0336da07dd63454`. The rehearsal rejected an invalid signature, rolled back after a failed health check, and installed a healthy signed candidate. At handoff the production job was waiting for the owner. Public readiness returned `{"ready":true}` without a revision. Installation of the listener and the first production promotion were unconfirmed. Recheck the selected run and timer when resuming.

The setup archive prepared on the owner's Mac is `.local/penicillion-release-tools-918b493.tar.gz` inside the project. To use it, run this in the **Mac repo terminal**, then continue at step 3 of [one-time installation](#one-time-installation-on-the-existing-droplet) in the **Droplet SSH terminal**:

```bash
scp -o IdentitiesOnly=yes -i ~/.ssh/penicillion_do \
  .local/penicillion-release-tools-918b493.tar.gz \
  aditya@142.93.57.64:penicillion-release-tools.tar.gz
```

On a fresh checkout, rebuild that archive with step 2 using the full setup SHA above. The owner's token goes into the installer's hidden prompt. Once the timer is active, hand the owner the Actions run for the commit they want to deploy.
