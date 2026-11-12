# Penicillion · Night Culture

Penicillion is a pixel-art medical word game. Grow a culture over seven Daily Rounds, or pass a living specimen between two to eight keepers in Slide Relay. Once the local game is running, open [Daily Rounds](http://127.0.0.1:4320/) or [Slide Relay](http://127.0.0.1:4320/#party).

## Start from a clean checkout

With Node.js 24.11.1 or newer, npm and Docker Compose v2 available, run this from the repository root:

```sh
npm run bootstrap
```

The first start needs internet access to fetch the pinned container images and locked npm dependencies. Bootstrap builds the local image, opens PostgreSQL and Redis, applies schema and role grants, publishes the immutable content release and waits for the gateway, two workers and local OIDC provider to be healthy. The command exits and the game keeps running in Docker. Re-running it preserves the database. It binds the game and sign-in chooser to this computer's loopback address.

| Local action | Command |
| --- | --- |
| Check the six services | `docker compose --profile play ps` |
| Stop the local game, retaining the database volume | `docker compose --profile play down` |
| Restart / rebuild, keeping scores and pinned issues | `npm run bootstrap` |
| Follow the local game logs | `docker compose --profile play logs -f worker-one worker-two` |

## Project plans

[Project state and roadmap](docs/ROADMAP.md) · [Corpus expansion and answer coverage](docs/CORPUS-PLAN.md) · [Hosting, privacy and scale](docs/HOSTING-PLAN.md)

## Repository layout

For feature development, start with the [developer handoff](AGENTS.md). It maps features to their implementation and records the current gameplay, animation and release decisions.

| Directory | Contents |
| --- | --- |
| [web/](web/) | Browser interface, original pixel art, fonts and sound |
| [server/](server/) | Game rules, HTTP and WebSocket APIs, authentication and database schema |
| [content/](content/) | Versioned medical question bank, sources, editorial tools and content checks |
| [local-idp/](local-idp/) | Sign-in provider for local play and testing |
| [scripts/](scripts/) and [tests/](tests/) | Bootstrap, migrations, verification, multiplayer recovery and load tests |
| [ops/](ops/) | Runtime configuration, access controls and hosting runbooks |
| [concept-lab/](concept-lab/) and [evidence/](evidence/) | Playable design studies, playtest recordings and performance measurements |
| [.github/](.github/) | GitHub Actions workflows and dependency update configuration |

## Play

- **Daily Rounds** gives a guest one ranked, resumable seven-prompt attempt. You have 25 seconds per prompt. The clock pauses between rounds. A source and editorial scoring rationale accompany each accepted term. Complete all seven to open the specimen log and comparison.
- **Practice** offers repeatable timed or untimed rounds outside the reserved daily bank. **Archive** opens past issues and annotated answers. Both are unranked.
- **Party → Create private room** opens Slide Relay. Open the room link in a separate browser profile or private window on this computer for the second seat. Everyone chooses **Ready**, then the host starts. Two keepers face each other. Up to eight can play around the table. An unused accepted concept sends the growing slide to the next keeper. When it pops, its holder loses a life. The meter below each keeper restores one missing life at 100 charge. Five Specialist finds, one Classic and one Clever fill it from zero. Quick match pairs waiting guests.
- **Account** opens the local sign-in chooser. Use **Violet Moss** and **Rowan Reed** for separate local test identities. Each can import or decline their own guest history, choose a handle, and join private friend groups. New accounts default to private answers and unlisted scores.
- **Settings** has mute, volume and static scenery. The game honors the system's reduced-motion setting. The interface, inputs and scores use bundled pixel fonts. [Artwork and four poses](web/design/ART.md) · [Typography and licenses](web/design/TYPE.md) · [Fullscreen question and reveal capture](evidence/redesign/slide-and-reveal.gif)

## Content and verification

The frozen release is `night-culture.2026-11.f275d05c0e60`, scoring ladder `recall.1`. It covers **88 scoped prompts, nine families and 1,565 accepted prompt–concept pairs**. The server seeds seven past issues, the current daily and 35 future days. Sixteen open categories remain available for practice and relay. The bank includes prompt-specific reasons and sourcing. The editors judged recall difficulty; no clinician signed off on this edition. [Inventory](content/INVENTORY.md) · [Every top pick](content/TOP-PICKS.md) · [Source rights](content/LICENSES.md) · [Editorial workflow and immutable corrections](content/README.md)

For the developer tests, install Python 3 for the offline editorial rebuild and keep the local PostgreSQL and Redis services running.

```sh
npm ci --ignore-scripts
npm test
```

To exercise the Daily and Practice reveals plus a two-player Slide Relay handoff and timeout in Chromium, start the local game, install the test browser, then run the smoke test.

```sh
npm exec -- playwright-core install --only-shell chromium
npm run test:browser
```

On a clean Linux runner, add `--with-deps` to the browser install command. Set `TEST_ORIGIN` to test a separate local instance.

The tests use disposable PostgreSQL schemas, including controlled server clocks for DST/deadline boundaries. The recovery test kills a disposable process after committing a handoff and disconnects a test-only Redis proxy. Actual game sessions remain separate. For native iteration, stop the Compose play services, keep db/cache up, then use `npm start`. For an isolated reviewer installation, use another Compose project name and set `PLAY_PORT`, `LOGIN_PORT`, `GAME_DB_PORT` and `GAME_CACHE_PORT` to four free loopback ports before bootstrap.

- [Independent browser playtest, fixes and retests](evidence/review/PLAYTEST.md), including phone/desktop stills, private groups, real sign-in, reconnect and rematch.
- [Fullscreen and rarity playtest](evidence/redesign/PLAYTEST.md), including the six awards, question transitions, close-ups, and mobile controls.
- [Slide Relay multiplayer playtest](evidence/relay-arena/PLAYTEST.md) · [Recorded handoff and pop](evidence/relay-arena/handoff-and-pop.gif) · [Life-meter and capacity results](evidence/load/relay-meter.md).
- [30-minute local capacity test](evidence/load/CAPACITY.md), [90-second retest of the frozen release](evidence/load/smoke-summary.md) and [distributed security probes](evidence/load/negative-probes.json). Both load tests exercised 2,000 simulated players. Run `npm run load` for a new isolated 30-minute profile.
- [Game rules, ownership and architecture](ops/ARCHITECTURE.md) · [HTTP/WebSocket contract](ops/API.md) · [Threat model and limits](ops/SECURITY.md).
- [Manual deployment, staging, recovery and rollback](ops/DEPLOYMENT.md). The repository's CI checks code and containers. Publication requires a separate deployment decision.

The original art chooser can still be run with `node concept-lab/server.mjs` on port 4317. The two studies, test evidence, editor drafts and supplied visual references are excluded from release images. [Concept review](concept-lab/evidence/PLAYTEST.md)

## GitHub Actions

[Game verification](.github/workflows/local-checks.yml) runs on pull requests and pushes to `main`. It tests the game against PostgreSQL and Redis, builds the game and nginx images, and exercises solo reveals and a two-player Slide Relay handoff in Chromium.

To get a tested Linux ARM64 image bundle for a commit on `main`, open **Actions → Game verification → Run workflow**. Download the artifact from the completed run, unzip it, and verify the archive before loading the images.

```sh
sha256sum -c SHA256SUMS
docker load -i penicillion-linux-arm64.tar.gz
```

On macOS, use `shasum -a 256 -c SHA256SUMS` for the checksum step. Pushing a version tag such as `v1.0.0` runs verification and attaches the bundle and checksum to a draft GitHub Release. Hosting remains a separate step. [Operations guide](ops/DEPLOYMENT.md)
