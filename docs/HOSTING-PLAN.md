# Hosting Penicillion on a DigitalOcean Droplet

**Selected for the commercial pilot on 12 November 2026.** Run the existing game on one self-managed DigitalOcean Basic Droplet for an expected 10–15 simultaneous players. The game currently runs locally. This decision records the target. Cloud spend, deployment and public launch await owner approval. Start a new chat with the [guided DigitalOcean setup](DIGITALOCEAN-SETUP.md).

## What moves to the server

| Component | Pilot design |
| --- | --- |
| Game | One always-running production Node container serves the browser, same-origin HTTP API and authenticated Relay WebSockets. The process already handles presence, expiry and cleanup. |
| Data | PostgreSQL 17 on a persistent disk stores accounts, runs, room state and the private corpus. Redis handles notifications, rate limits and socket leases. Both use authenticated TLS on a private container network. |
| Public entry | A reverse proxy terminates HTTPS, forwards WebSocket upgrades and overwrites the trusted client IP. The Node worker is reachable only from that proxy. |
| Jobs | Schedule database backups and the Daily issue refill on the host. The existing worker advances Relay deadlines. |
| Operations | The owner manages OS and container updates, disk space, certificate renewal monitoring, backups and recovery. A single-host restart interrupts all three modes. |

**Sizing assumption:** one shared vCPU, 2 GiB RAM and 50 GiB disk at $12/month. Daily Droplet backups at 30% add $3.60, for an estimated **$15.60/month** before domain, separate backup storage, tax and usage extras. Requote the region and size before creating the VM. Validate memory during a load test, backup and restart. The full game has not been tested on this SKU. [Droplet prices](https://www.digitalocean.com/pricing/droplets) · [Backup prices](https://www.digitalocean.com/pricing/backups)

Daily, Practice and Slide Relay can use their current interfaces, scoring, schema and multiplayer protocol. Deployment work includes production Compose configuration, TLS, ingress, secrets, building for the host CPU, initializing the database and verifying recovery. The [current architecture](../ops/ARCHITECTURE.md) and [GitHub workflow](../.github/workflows/local-checks.yml) are the working baseline. The [AWS runbook](../ops/DEPLOYMENT.md) and [Supabase Relay proposal](SLIDE-RELAY-MIGRATION.md) are historical references.

## Accounts and secrets

Use the existing guest sessions and server-side Google OIDC integration. Set up the exact HTTPS callback for each approved environment. Review Clerk or other identity providers later if new account features require them. Keep runtime, editorial, backup and migration credentials separate. Only allowlisted assets and authorized API projections go to the browser. Keep all real environment files, private keys, release internals and connection strings outside the web root, images, Git and logs. Use disposable secrets to test denial of dotfile and corpus requests. [Identity implementation](../server/identity.mjs) · [Security model](../ops/SECURITY.md)

## Database authorization and row-level security

Today the API checks ownership and membership, and the runtime has broad SELECT privileges plus enumerated writes. The schemas currently define no RLS policies. Add PostgreSQL RLS as a second line of defense for player-scoped data. Limit columns separately for receipts, hidden fuses, sessions and answer keys. [Runtime grants](../ops/runtime-grants.sql) · [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

| Rows | Proposed access and exceptions |
| --- | --- |
| Solo runs, rounds, outcomes, command receipts, seen history, unlocks and missing-answer reports | Owner-only access, joining child rows to their run. Limit private reports to submitter operations and editorial review. Give leaderboard aggregates, voluntary sharing and guest-to-account claims narrow, separately audited paths. |
| Groups, memberships, blocks, bans and invitations | Active membership for group reads, owner or designated role for administration, actor-scoped blocks. Restrict invite redemption to a validated token operation. Verify kicks, revoked invitations and changes in sharing immediately. |
| Rooms, seats, room events and command receipts | Seat membership and valid participation determine snapshot access. Only the submitting actor may replay their private receipt. Use narrowly privileged operations for joining, matching, rematch and the cross-player turn update. Keep private fuse and answer-history internals behind explicit projections. |
| Sessions, identities, login attempts, unpublished content, future issues and editorial review | Restrict by role, operation and returned columns. Identity lookup occurs before the actor context exists. Give the login service a narrow lookup path. Give the game server internal access for judging and operators separate publication rights. |

Begin each actor-scoped transaction on one checked-out connection and set the actor context transaction-locally from the validated server session. Missing context denies access. Use both read/update predicates and write checks. The runtime role must be a non-owner without BYPASSRLS. Review FORCE ROW LEVEL SECURITY and privileged function ownership, fixed search paths and execution grants. A client-set actor ID is never authoritative. Give scheduled room expiry, cross-player settlement and aggregate computation explicit service privileges. Roll out by table family in an isolated database first. Exercise two guests, an account import, a spectator, a departed seat with an old receipt, guessed IDs, reused pooled connections, leaderboard opt-outs and a revoked session over an existing socket. Require correct responses and denials after reconnects and across pooled database connections.

## Rate limits and repeated reads

Keep shared limits across all instances. The [existing budgets](../ops/SECURITY.md) cover account and network abuse: guest creation 400/minute/network, login starts 5/minute/actor and 90/minute/network, room creation 5/10 minutes/actor, joins 10/minute/actor and 300/minute/network, answers 12/25 seconds/actor/mode, room commands 10/second/actor and 80/second/room, socket handshakes 30/minute/actor and four concurrent sockets/actor. HTTP writes also have an outer 90/minute/actor budget. Private reports already have a durable five-per-day actor limit.

For launch, test HTTP and socket paths against the same budgets, including repeated invalid commands, private-room probes and command replays. Add edge burst limits before expensive session lookup or OIDC callback work, bounded leaderboards and archive pagination, and tighter invite creation/redemption or report budgets if telemetry warrants. Measure legitimate refusals during ready-up, a school behind one IP, and mass reconnects. Return retry delays, reconnect with jitter, cap payloads and backpressure, and avoid charging identical retries twice in the game ledger. Monitor aggregate 429/503 counts by action. Keep raw answer text, IPs, tokens and room codes out of general analytics.

Start with existing Redis coordination and the existing epoch-based PostgreSQL standings cache. Instrument query count, latency and repeated keys before adding response caches. Proposed first candidates:

| Read | Key, lifetime and privacy |
| --- | --- |
| Repeated match lookups | Server-only positive mappings keyed by immutable release, prompt and normalized-term digest. Bound size, use about one hour TTL, and expire naturally on a new release namespace. Still check the round, duplicate concept, deadline and score transaction in PostgreSQL. Avoid caching arbitrary user misses initially. |
| Common aggregate reads | Key anonymous score distributions by issue, scoring release and committed standings epoch for 15–60 seconds. Apply participation thresholds and privacy gates on every request, then attach any personal result separately. Keep opt-in named boards out of this first cache. |
| Assets and private requests | Cache versioned static assets at the edge. Bypass shared HTTP caches for sessions, personalized Daily responses, histories, friend groups, invites and private room snapshots. Test with two players requesting the same URL. |

Use short TTLs with jitter, bound concurrent identical fills, record hit rate, memory and evictions. Isolate disposable caches from the noeviction limiter/lease service when cache volume competes for memory. Fall back to PostgreSQL on optional cache misses/outages. Preserve the existing 503 policy for operations that cannot enforce required limits. A lost notification recovers through room versions and a fresh authorized snapshot.

## Pilot verification

The setup guide covers approval boundaries, host preparation, external monitoring, off-host backups, the first restore and rollback. Record results for all three modes, Google sign-in, private rooms and 30 mixed simultaneous players for 30 minutes. Share the host-specific evidence and costs with the owner before opening public traffic. [Pilot walkthrough](DIGITALOCEAN-SETUP.md)
