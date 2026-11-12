# Night Culture local capacity test

The run met all local capacity targets. 1,500 paced solo players and 500 connected relay seats across 100 rooms ran for 30.0 minutes after ramp. The window began at 2026-11-12T17:30:34.755Z. [Raw measurements](measured-2026-11-12T17-28-47-612Z.json) · [Environment and release comparison](environment-2026-11-12T17-28-47-612Z.json).

| Measurement | Observed | Full-run target |
|---|---|---|
| Concurrent participation | 1,500–1,500 solo, 500–500 sockets | 1,500 solo + 500 sockets |
| Sustained window | 30.0 min | 30 min |
| Successful gameplay writes | 257,845 total, 320 peak/s, 1,791 seconds at ≥100/s | ≥100/s in a burst |
| Solo submit, server p95 | 28.9 ms, 111,791 timings | <300 ms |
| Relay event stamp to peer receipt, p95 | 19 ms, 85,860 peer observations | <500 ms |
| Unexpected HTTP/WS failures | 2 / 262,086 HTTP responses and socket commands (0.0008%) | <1% |
| Integrity | 0 score-sum mismatches, 0 missing acknowledged outcomes, 0 duplicate pops | Zero each |

In a separate deadline burst during the plateau, 128 of 128 near-deadline submissions scored. Their server receipt times ranged from -481 to -463 ms relative to expiry. All 32 late submissions timed out. A one-second window contained 128 accepted burst writes in addition to the background traffic. [Deadline burst](deadline-burst-4350.json).

**Traffic and accuracy.** Two workers behind the local proxy each used a 16-connection PostgreSQL pool. The normal guest helper pre-issued the cohort in a new benchmark database, with its own Redis namespace. 125 players opened the published daily together at the start of ramp. Gameplay used HTTP or WebSocket. Players spent about 12–21 seconds thinking, with a subset submitting 450–1,600 ms before expiry, then read reveals for 4.3–9.6 seconds. After one ranked daily, each player continued in practice. Relay holders attempted an unused canonical term every 5.2–11 seconds. Eliminated seats remained connected until rematch.

Server-Timing measures solo request handling through commit, before delivery to the generator. Relay timing begins at the durable event stamp immediately before commit and ends at a different seat’s receipt. This is a conservative upper bound on commit-to-peer latency. The full run also counted fresh reconnect snapshots, which can carry an older event. Solo server p99 was 397.6 ms, relay upper-bound p99 was 396 ms, and local HTTP end-to-end p95 was 28.6 ms.

**Persistence and reconnect.** 110,552 successful solo responses matched the pinned editorial data. 1,239 pairs of exact retries produced the same score and outcome count. The SQL audit covered 113,734 outcomes across 17,039 runs and found 0 duplicate ranked allocations and 0 finish-count mismatches. The room ledger contained 6,310 timeout events. Its room/epoch constraint and audit detected 0 double pops. The guest collision preserved the unfinished account allocation. Mid-run, 500 of 500 WebSocket open handshakes completed in 179 ms. Ordinary traffic returned 0 rate limits. The [adversarial probe](negative-probes.json) separately counted the expected 429 and permission denials.

The generator counted 2 unexpected client transport resets (read ECONNRESET, socket hang up). The client resumes the authoritative run after a failed request. The capture does not distinguish a peer-closed idle HTTP connection from other transport causes. The latest [worker counters](workers-2026-11-12T17-28-47-612Z.json) reported 0 server errors and 0 socket-handler errors.

**Resources.** Apple M5 Pro, 15 logical CPUs, 24 GiB RAM, darwin 25.3.0 arm64, Node v24.18.0. Docker exposed 15 CPUs, 8320815104 bytes RAM. Services used postgres:17.6-alpine and redis:7.4.6-alpine. The sampled peaks for both workers combined were 50.8% CPU and 459.5 MiB RSS. The generator reached 255.5 MiB RSS and event-loop p99 peaked at 22.5 ms. Database connections peaked at 34 including the sampler. The isolated database reached 683.5 MiB. Sampled container peaks were 164.4% CPU and 412.5 MiB for PostgreSQL and 4.3% CPU and 10.5 MiB for Redis. Container figures include concurrent local QA in other databases and key namespaces.

The transfer counter measured 1130.2 MiB of response bodies and socket frames during ramp and steady traffic, excluding headers. The published web directory contained 26 files totaling 248,014 bytes. Its largest asset was web/fonts/pixelify-sans.ttf (79,160 bytes).

**Release.** night-culture.2026-11.308ba7b582ee contained 88 prompts and 1,565 prompt–canonical mappings. Compared with night-culture.2026-11.f275d05c0e60, the final source added 0 mappings, removed 0, changed 0 scores and 0 prompts, and added 0 / removed 2 normalized alias rows. The workers connected to the isolated database using penicillion. The [final-build smoke](smoke-summary.md) covers the frozen release, restricted runtime role and subsequent archive-privacy and histogram-recovery fixes.

An [earlier attempt](interrupted-attempt.json) stopped after 219 seconds when its tool session closed. It produced no final audit. These 30-minute results come entirely from the uninterrupted rerun.

**Reproduce.** Bootstrap the local game, then run `npm run load`. The benchmark creates a fresh `penicillion_load_<timestamp>` database with a separate Redis namespace, listens on loopback port 4350, and writes its raw report under `evidence/load/`. During the plateau, `node scripts/load/burst.mjs` repeats the deadline wave and `node scripts/load/negative.mjs` repeats permission and shared-limit probes. Record exact images and compare release metadata with `node scripts/load/environment.mjs TIMESTAMP DATABASE_NAME`. Summarize with `node scripts/load/summarize.mjs EXACT_RESULT_FILE`. The shorter final-build check uses `LOAD_SOLO=1500 LOAD_ROOMS=100 LOAD_SECONDS=90 LOAD_PORT=4360 npm run load`.

The generator shares the application host and caps concurrent HTTP connections at 256. Its solo active count uses successful requests in the previous 60 seconds. It simulates gameplay without rendering browser pages. Before deployment, repeat the 30-minute scenario using a separate generator host against production-shaped TLS and WebSocket ingress, database pooling and CPU limits. Verify the same latency, throughput, failure and integrity thresholds.
