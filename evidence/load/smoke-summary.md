# Night Culture final-build smoke

The final-build smoke reached its requested concurrency and passed the integrity audit. 1,500 paced solo players and 500 connected relay seats across 100 rooms ran for 1.5 minutes after ramp. The window began at 2026-11-12T18:08:42.460Z. [Raw measurements](measured-2026-11-12T18-06-55-365Z.json) · [Environment and release comparison](environment-2026-11-12T18-06-55-365Z.json).

| Measurement | Observed | Full-run target |
|---|---|---|
| Concurrent participation | 1,500–1,500 solo, 500–500 sockets | 1,500 solo + 500 sockets |
| Sustained window | 1.5 min | 30 min |
| Successful gameplay writes | 12,674 total, 166 peak/s, 90 seconds at ≥100/s | ≥100/s in a burst |
| Solo submit, server p95 | 11.9 ms, 5,694 timings | <300 ms |
| Relay event stamp to peer receipt, p95 | 8 ms, 4,444 peer observations | <500 ms |
| Unexpected HTTP/WS failures | 0 / 12,763 HTTP responses and socket commands (0.0000%) | <1% |
| Integrity | 0 score-sum mismatches, 0 missing acknowledged outcomes, 0 duplicate pops | Zero each |

**Reconnect measurements.** The [first frozen-build smoke](measured-2026-11-12T18-02-45-967Z.json) reported **3,137 ms** p95 across 4,688 measurements. The original collector combined delivery of a new pass to an existing connection with the age of the most recent pass returned when a player reconnected. In that run all 500 WebSocket open handshakes completed in 161 ms.

The repeat used the same game, content and service versions and kept those distributions separately. Ongoing connections received new passes in **8 ms p95** (4,444 other-seat deliveries). Counting first-snapshot event ages together with those deliveries gave 3,004 ms p95. For the 376 first snapshots carrying a tracked pass to another seat, its age was 7,502 ms p95. All 500 reconnected seats received their first personalized room snapshot, measured individually from dial, in 19 ms p95 and 22.5 ms maximum. [First-run probes and measurement change](reconnect-measurement.json).

In a separate deadline burst during the plateau, 128 of 128 near-deadline submissions scored. Their server receipt times ranged from -499 to -487 ms relative to expiry. All 32 late submissions timed out. A one-second window contained 128 accepted burst writes in addition to the background traffic. [Deadline burst](deadline-burst-4360.json).

**Traffic and accuracy.** Two workers behind the local proxy each used a 16-connection PostgreSQL pool. The normal guest helper pre-issued the cohort in a new benchmark database, with its own Redis namespace. 125 players opened the published daily together at the start of ramp. Gameplay used HTTP or WebSocket. Players spent about 12–21 seconds thinking, with a subset submitting 450–1,600 ms before expiry, then read reveals for 4.3–9.6 seconds. After one ranked daily, each player continued in practice. Relay holders attempted an unused canonical term every 5.2–11 seconds. Eliminated seats remained connected until rematch.

Server-Timing measures solo request handling through commit, before delivery to the generator. Relay timing begins at the durable event stamp immediately before commit and ends at a different seat’s receipt. This is a conservative upper bound on commit-to-peer latency. The live relay sample excludes each connection’s first snapshot. Solo server p99 was 37.1 ms, relay upper-bound p99 was 12 ms, and local HTTP end-to-end p95 was 12.1 ms.

**Persistence and reconnect.** 5,636 successful solo responses matched the pinned editorial data. 59 pairs of exact retries produced the same score and outcome count. The SQL audit covered 8,801 outcomes across 2,018 runs and found 0 duplicate ranked allocations and 0 finish-count mismatches. The room ledger contained 436 timeout events. Its room/epoch constraint and audit detected 0 double pops. The guest collision preserved the unfinished account allocation. Mid-run, 500 of 500 WebSocket open handshakes completed in 158 ms. Ordinary traffic returned 0 rate limits. The [adversarial probe](negative-probes-4360.json) separately counted the expected 429 and permission denials.

**Resources.** Apple M5 Pro, 15 logical CPUs, 24 GiB RAM, darwin 25.3.0 arm64, Node v24.18.0. Docker exposed 15 CPUs, 8320815104 bytes RAM. Services used postgres:17.11-alpine and redis:7.4.12-alpine. The sampled peaks for both workers combined were 32.6% CPU and 415.7 MiB RSS. The generator reached 214.0 MiB RSS and event-loop p99 peaked at 21.6 ms. Database connections peaked at 33 including the sampler. The isolated database reached 71.1 MiB. Sampled container peaks were 76.1% CPU and 294.0 MiB for PostgreSQL and 1.8% CPU and 10.4 MiB for Redis. Container figures include concurrent local QA in other databases and key namespaces.

The transfer counter measured 82.9 MiB of response bodies and socket frames during ramp and steady traffic, excluding headers. The published web directory contained 26 files totaling 248,014 bytes. Its largest asset was web/fonts/pixelify-sans.ttf (79,160 bytes).

**Release.** night-culture.2026-11.f275d05c0e60 contained 88 prompts and 1,565 prompt–canonical mappings. The workers connected to the isolated database using night_play.

**Reproduce.** Bootstrap the local game, then run `npm run load`. The benchmark creates a fresh `penicillion_load_<timestamp>` database with a separate Redis namespace, listens on loopback port 4350, and writes its raw report under `evidence/load/`. During the plateau, `node scripts/load/burst.mjs` repeats the deadline wave and `node scripts/load/negative.mjs` repeats permission and shared-limit probes. Record exact images and compare release metadata with `node scripts/load/environment.mjs TIMESTAMP DATABASE_NAME`. Summarize with `node scripts/load/summarize.mjs EXACT_RESULT_FILE`. The shorter final-build check uses `LOAD_SOLO=1500 LOAD_ROOMS=100 LOAD_SECONDS=90 LOAD_PORT=4360 npm run load`.

The generator shares the application host and caps concurrent HTTP connections at 256. Its solo active count uses successful requests in the previous 60 seconds. It simulates gameplay without rendering browser pages. Before deployment, repeat the 30-minute scenario using a separate generator host against production-shaped TLS and WebSocket ingress, database pooling and CPU limits. Verify the same latency, throughput, failure and integrity thresholds.
