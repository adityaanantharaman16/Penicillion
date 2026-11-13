---
name: penicillion-feature
description: Use when planning, implementing, or playtesting a feature in the Penicillion Night Culture game. Covers solo and multiplayer behavior, answer content, account privacy, local verification, and handing a tested feature to the owner for release.
---

# Develop a Penicillion feature

Work from the Penicillion repository root. Read the [project instructions](../../../AGENTS.md) for the file map, visual conventions and release policy. Check `git status --short --branch` and recent commits before editing because other chats may be working on the same game. The [roadmap](../../../docs/ROADMAP.md) identifies planned work. Confirm current behavior in the checkout, and use the public readiness endpoint if the task depends on which revision is live.

## Choose the implementation path

| Feature area | Where to look and what to preserve |
| --- | --- |
| Browser UI | The shipped client lives in `web/`. Start with `web/app.js` for routing and cleanup. Preserve bundled pixel typography in every control, distinct score digits, and the fullscreen layout at desktop and phone sizes. Respect reduced motion and Static scenery. See the [art direction](../../../web/design/ART.md) and [typography](../../../web/design/TYPE.md). |
| Daily, Practice and Archive | Trace a submitted answer from `web/solo.js` to `server/solo/index.mjs`. These modes share UI code. Scope changes to the requested modes and check the others for unintended effects. Daily is ranked and resumable, Practice is repeatable, and Archive uses issued content. Test a reload during the affected round or reveal. [Solo API](../../../server/solo/API.md) |
| Slide Relay | Start with `web/relay.js` and `web/relay-arena.js` for rendering, `server/rooms.mjs` for rules and `server/realtime.mjs` for delivery. PostgreSQL owns turns, deadlines, lives and command receipts. Redis signals peers after commit. Preserve idempotent retries and refresh the authorized snapshot on reconnect. Test two distinct browser sessions for handoff, timeout and reconnect when changing turn behavior. [Game architecture](../../../ops/ARCHITECTURE.md) |
| Answers, scoring and sources | Reproduce the answer against its specific prompt and release. Edit the curated inputs, rebuild and validate a new edition, and exercise both the intended match and a close medical nonmatch. Issued Daily rounds and saved games retain their release. Practice and Relay draw from the open pool. Keep unrevealed mappings server-side. Use `web/rarity.js` for uppercase tier names and points, the shared palette for color and **More Info** for the source disclosure. [Editorial workflow](../../../content/README.md) · [Corpus expansion plan](../../../docs/CORPUS-PLAN.md) |
| Accounts, groups and standings | Trace the session and actor through `server/identity.mjs`, the relevant social or solo endpoint, and the browser UI. Verify guest and signed-in behavior plus access from a second identity for private data. Use the local sign-in chooser. Keep production credentials on the host. [API contracts](../../../ops/API.md) · [Security and rate limits](../../../ops/SECURITY.md) |

## Run and verify locally

Use Node 24, npm, Python 3 and Docker Compose v2. On a fresh checkout run `npm ci --ignore-scripts` then `npm run bootstrap`. The default local setup serves built containers. Run bootstrap again after edits before judging what the browser shows. Open [Practice](http://127.0.0.1:4320/#practice) for repeatable solo testing or [Party](http://127.0.0.1:4320/#party) for Relay. The local stack exercises two game workers. The hosted Droplet runs one. [Local setup and test identities](../../../README.md) · [Hosted architecture](../../../docs/HOSTED-SITE.md)

Run `npm test` against the local PostgreSQL and Redis services. For a browser change, install Chromium once with `npm exec -- playwright-core install --only-shell chromium`, then run `npm run test:browser` and play the changed interaction. Pick the checks that distinguish success for the feature, such as reading a colored score on a phone, restoring a Daily reveal after reload, or observing the same Relay turn in both sessions. [Browser test entry points](../../../scripts/ci/)

## Hand off a release

For routine app changes on `main`, GitHub Actions tests the commit and rehearses its AMD64 image. Give the owner the run link for that commit and leave the production review to **adityaanantharaman16**. After approval, verify the deployment job succeeded and [public readiness](https://penicillion.io/health/ready) reports the approved SHA. The release listener is already installed. For schema, grant, published corpus or host configuration changes, identify the required migration and recovery steps in the handoff. [Actions deployment guide](../../../docs/ACTIONS-DEPLOY.md) · [Manual release and recovery](../../../docs/HOSTED-SITE.md#manual-release-and-recovery)
