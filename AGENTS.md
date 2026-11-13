# Developing Penicillion

Night Culture (concept B) is the playable game. Work from this repository's root. The production client lives in `web/` and uses native JavaScript modules, semantic HTML and pixel-art canvas scenes. `concept-lab/` preserves the earlier playable design studies. The public GitHub repository is [adityaanantharaman16/Penicillion](https://github.com/adityaanantharaman16/Penicillion).

For a fresh chat, start with the [project roadmap](docs/ROADMAP.md). The selected host is one self-managed DigitalOcean Droplet serving https://penicillion.io. The [local release rehearsal](docs/DROPLET-REHEARSAL.md) identifies the candidate image and checks already completed. For updates to the hosted game, use the [hosting architecture and feature release guide](docs/HOSTED-SITE.md). For account and server setup, use the [current Droplet checkpoint and owner walkthrough](docs/DIGITALOCEAN-SETUP.md), including the [Google sign-in instructions](docs/DIGITALOCEAN-SETUP.md#google-sign-in) and [hosting plan](docs/HOSTING-PLAN.md). For future monetization, use the [advertising plan](docs/ADS-PLAN.md).

## Start and test a feature

1. Check `git status --short --branch` and `git log -5 --oneline` for current work. The [README](README.md) covers prerequisites, ports and local sign-in.
2. With Node 24, npm, Python 3 and Docker Compose v2, run `npm ci --ignore-scripts` and `npm run bootstrap`. Open [Practice](http://127.0.0.1:4320/#practice) for repeatable solo rounds or [Party](http://127.0.0.1:4320/#party) for multiplayer. Use a second browser profile or private window for a second player.
3. The default local site serves files from built containers. Run `npm run bootstrap` after source changes to play the updated build. This preserves local scores and saved runs.
4. Run `npm test` for the game, content, database, recovery and concept suites. For browser changes, install Chromium once with `npm exec -- playwright-core install --only-shell chromium`, then run `npm run test:browser` against the updated site. The [solo](scripts/ci/solo.browser.mjs) and [relay](scripts/ci/relay.browser.mjs) tests exercise real player flows. Play through the affected screen at desktop and phone sizes when changing layout or motion.

## Where to make changes

| Feature | Start here |
| --- | --- |
| Routes, navigation and shared controls | [Hash router and route cleanup](web/app.js), [UI helpers](web/ui.js), [preferences and sound](web/preferences.js) |
| Daily, Practice, Archive and recap | [Solo UI](web/solo.js), [scene lifecycle](web/scene.js), [growth drawing and timing](web/art/growth.js), [camera and rendering](web/art/night.js), [server run lifecycle](server/solo/index.mjs) |
| Slide Relay | [Room UI](web/relay.js), [arena animation](web/relay-arena.js), [authoritative room rules](server/rooms.mjs), [live connections](server/realtime.mjs) |
| Rarity labels, points and colors | [Shared tier vocabulary and relay charge](web/rarity.js), [badge palette](web/rarity.css), [editorial scoring assignments](content/README.md) |
| Accounts, friends and standings | [Social UI](web/social.js), [identity](server/identity.mjs), [social APIs](server/social.mjs), [standings](server/solo/standings.mjs) |

## Design and gameplay decisions

- Use the bundled pixel fonts throughout, including inputs, timers and scores. The custom numerals distinguish `+15` from `+1S`. Keep full-browser layouts usable with the keyboard open. [Typography](web/design/TYPE.md)
- Display tiers as **CLASSIC** (10), **CLEVER** (15), **STUDENT** (30), **RESIDENT** (60), **SPECIALIST** (85) and **ARE YOU A DOCTOR?** (100). Pair color with the tier name or symbol. The source disclosure is labeled **More Info**.
- Daily and Practice use the floating typing tray. On acceptance, the submitted answer rises in its tier color, then the uppercase rarity takes its place. Small colonies take roughly two seconds to grow. Rare finds branch and bloom over three to four seconds. Next works immediately. Reduced motion, Static scenery and reloading a saved reveal show the settled result. Daily, Practice and Archive share UI code, so check the mode when editing these effects. [Art direction](web/design/ART.md)
- In Slide Relay, two keepers face each other and larger rooms form a ring. A correct unused answer passes the growing slide. A timeout pops it above the holder and costs one life. Each keeper starts with three lives. Five SPECIALIST passes plus one CLASSIC and one CLEVER earn 100 charge and restore a missing life. At full health, charge caps at 99. [Multiplayer playtest and recordings](evidence/relay-arena/PLAYTEST.md)
- PostgreSQL owns scores, deadlines, turns and command receipts across both workers. Redis notifies peers after a commit. Preserve idempotent retries and restore the current snapshot on reconnect. Keep unrevealed answers server-side and publish content corrections as versioned releases so saved runs remain reproducible. [Architecture](ops/ARCHITECTURE.md) · [API contracts](ops/API.md) · [Content editing](content/README.md)

## Delivery and hosting

Pushes to `main` and pull requests run [Game verification](.github/workflows/local-checks.yml). A manual run also produces a Linux ARM64 bundle of the tested game and nginx images. Version tags prepare a draft GitHub Release. Main pushes also produce a rehearsed AMD64 image. Production promotion requires owner approval. [Deployment guide](docs/ACTIONS-DEPLOY.md) The archived AWS ingress and Supabase migration plans are historical. Hosting and spend require separate owner approval.
