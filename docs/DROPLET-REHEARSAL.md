# DigitalOcean release rehearsal, 12 November 2026

The release candidate uses committed game revision `66beab9`. Local UI edits in progress in the development checkout are outside this candidate. The game image was built for linux/amd64 on Docker Desktop. A disposable Compose project served the production Node process behind nginx at https://penicillion.io, with browser-only loopback routing, a private test CA, synthetic Google credentials, PostgreSQL 17 and Redis. Only the HTTPS proxy published a port, bound to 127.0.0.1:18443. The normal development stack was left running independently.

| Check | Observed result |
| --- | --- |
| Start and initialize | The database and runtime used separate roles. Core and solo migrations, grants, immutable release publication and calendar seed succeeded twice. A live database query confirmed TLS on the runtime connection. |
| Browser gameplay | Three Chromium tests passed. Daily and Practice submitted an answer, displayed the tier and restored the reveal after reload. Two separate desktop and mobile browser sessions saw the same Relay handoff, charge and timeout loss. The browser launch used a loopback hostname mapping and pinned only the rehearsal certificate key. |
| HTTPS and private files | A request using the private CA and an explicit loopback connection returned readiness 200. Requests for /.env and /content/release.json both returned 404. |
| Backup recovery | A custom-format PostgreSQL dump was encrypted into local restic snapshot f5813bbc. Restoring it into a new database reproduced every row of 2 saved outcomes, 6 solo command receipts, 4 room command receipts, 43 Daily issues and 1,565 prompt–answer mappings. A digest of each full set of ordered rows matched the source. |
| Restart | All four services restarted. The worker became healthy, HTTPS returned ready and the source database retained both scored outcomes. A separate daily refill succeeded. The rehearsal containers were stopped afterward. |

The local release archive is in the workspace under `.local/droplet-release-66beab9/`. Its SHA-256 is `6d0ebecd6aa3d8a488542022d4d631fe404382a6c8d0ed12e1a78739efca1fe4`. The Docker image ID reported by this build is `sha256:b971e56e270bbc30375be73e321d2548fb2e695b6cb35ceb2c65c569a1d08d7c`. The backup volume and private rehearsal keys are separate from the deliverable. [Deployment commands](../ops/droplet/README.md)

The owner reported that DigitalOcean account signup is the next step. Droplet creation and DNS changes require approval. The future hosted verification covers the actual machine's capacity, physical reboot, public TLS and renewal, Google callback, off-host backup and alerts, and play from independent internet connections. This local result measures functional compatibility. [Owner setup](DIGITALOCEAN-SETUP.md)
