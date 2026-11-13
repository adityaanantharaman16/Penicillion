# DigitalOcean release rehearsal, 12 November 2026

The first rehearsal used committed game revision `66beab9`. Local UI edits in progress in the development checkout are outside this candidate. The game image was built for linux/amd64 on Docker Desktop. A disposable Compose project served the production Node process behind nginx at https://penicillion.io, with browser-only loopback routing, a private test CA, synthetic Google credentials, PostgreSQL 17 and Redis. Only the HTTPS proxy published a port, bound to 127.0.0.1:18443. The normal development stack was left running independently.

| Check | Observed result |
| --- | --- |
| Start and initialize | The database and runtime used separate roles. Core and solo migrations, grants, immutable release publication and calendar seed succeeded twice. A live database query confirmed TLS on the runtime connection. |
| Browser gameplay | Three Chromium tests passed. Daily and Practice submitted an answer, displayed the tier and restored the reveal after reload. Two separate desktop and mobile browser sessions saw the same Relay handoff, charge and timeout loss. The browser launch used a loopback hostname mapping and pinned only the rehearsal certificate key. |
| HTTPS and private files | A request using the private CA and an explicit loopback connection returned readiness 200. Requests for /.env and /content/release.json both returned 404. |
| Backup recovery | A custom-format PostgreSQL dump was encrypted into local restic snapshot f5813bbc. Restoring it into a new database reproduced every row of 2 saved outcomes, 6 solo command receipts, 4 room command receipts, 43 Daily issues and 1,565 prompt–answer mappings. A digest of each full set of ordered rows matched the source. |
| Restart | All four services restarted. The worker became healthy, HTTPS returned ready and the source database retained both scored outcomes. A separate daily refill succeeded. The rehearsal containers were stopped afterward. |

The local release archive is in the workspace under `.local/droplet-release-66beab9/`. Its SHA-256 is `6d0ebecd6aa3d8a488542022d4d631fe404382a6c8d0ed12e1a78739efca1fe4`. The Docker image ID reported by this build is `sha256:b971e56e270bbc30375be73e321d2548fb2e695b6cb35ceb2c65c569a1d08d7c`. The backup volume and private rehearsal keys are separate from the deliverable. [Deployment commands](../ops/droplet/README.md)

The owner later provisioned the Droplet. The future hosted verification covers the actual machine's capacity, physical reboot, public TLS and renewal, Google callback, off-host backup and alerts, and play from independent internet connections. This local result measures functional compatibility. [Owner setup](DIGITALOCEAN-SETUP.md)

## Staged update · 1472373

The production linux/amd64 image from `1472373501abf450512dd989abe27538f36cc9e9` includes the corner menu, About FAQ and Culture Room labels. GitHub CI passed. In the separate local Droplet setup, database initialization and HTTPS readiness passed along with nine Chromium tests covering navigation, solo play and two-player Relay. The owner confirmed both archive checksums and the image revision on the Droplet. [CI run](https://github.com/adityaanantharaman16/Penicillion/actions/runs/43321008898) · [Current host checkpoint and outstanding checks](DIGITALOCEAN-SETUP.md)

| File in `.local/droplet-release-1472373/` | SHA-256 |
| --- | --- |
| `penicillion-game.tar.gz` | `7c75a84ded3279251a940f4475de65564c3a9d0c032518bc37204a4c599704cd` |
| `droplet-config.tar.gz` | `5f442fb23de1de46b0954b8d16acb8e68e151db23279d3907daa5fa0672fe3f5` |
