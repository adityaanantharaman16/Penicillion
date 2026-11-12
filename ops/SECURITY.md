# Security model and verification

The browser, all supplied strings, invitation URLs and cross-site requests are untrusted. The attacker may own several guests, run a custom client, replay commands on both workers, read public assets or hold an obsolete session. The local trusted boundary contains the gateway, workers, identity provider and their private PostgreSQL/Redis endpoints. Production replaces the local sign-in surface with Google. Scoring, ranking, permissions and the hidden fuse live behind that boundary.

| Area in OWASP ASVS 5 | Controls exercised in this project |
| --- | --- |
| V1 Encoding and Sanitization, V2 Validation and Business Logic | JSON key/type allowlists, bounded bodies and terms, restricted group names/handles, parameter-bound SQL. Editorial SQL bulk insert table/column names come from private constants. DOM text nodes render terms, notes and handles. No input-driven shell execution, rich HTML, uploads or URL fetching. |
| V3 Web Frontend Security, V4 API and Web Service | Fixed host and origin, same-origin POST, session-bound CSRF, Fetch Metadata rejection, explicit nonce with strict-dynamic for HTML scripts, local styles/fonts, no framing/object embeds, no CORS grant. Assets use real path containment. |
| V6 Authentication, V7 Session Management, V10 OAuth and OIDC | Opaque 192-bit cookie values stored as SHA-256 digests. A fresh session secret and CSRF token are issued on login. State is bound to the guest's current session and consumed once. PKCE, issuer, nonce and code validation use openid-client. Identity key is issuer + subject. Production requires HTTPS, Google, strong secrets, Secure and host-prefixed cookies. Sign-out revokes the active session; deletion removes the account’s sessions. |
| V8 Authorization | Actor comes only from a validated session. Run ownership, atomic history claim, group membership, completion and sharing gates apply even to direct requests. Expiring hashed invitations and member/owner checks. Named boards are opt-in. Private relay membership is rechecked on access. |
| V4 WebSockets and V16 Security Logging and Error Handling | Same-origin authenticated upgrade, socket lease, schema/type/size validation and per-message session validation. Personal snapshots contain public room state. Bounded pending messages/backpressure and idle heartbeat terminate dead sockets. Ordinary logs aggregate counts, pool/RSS and submit-latency buckets. No bodies, cookies, codes, reported terms, IP addresses or OIDC query strings in access logs. |
| V11 Cryptography, V12 Secure Communication, V13 Configuration | CSPRNG sessions/codes/fuses, HMAC input fingerprints, fixed TLS public origin, managed data services on private networks. Runtime role has no schema DDL or content-write privileges. Local IdP is a separate optional image; production rejects local/test issuer overrides. |
| V15 Secure Coding and Architecture | Unique ranked attempt, locked outcome and epoch, immutable release/issue data, transactional claims and post-commit delivery. Readiness reflects PostgreSQL and Redis availability. Untrusted raw reports are private editorial data. |

Verification is scoped to the implemented controls, not an ASVS certification. Use the local test suite, the independent browser/security ledger, and the load report together. The local sign-in chooser trusts anyone on the local machine to select either test account. Production client registration is separate. [OWASP ASVS](https://asvs.owasp.org/) · [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

## Rate budgets

The Redis fixed-window counter starts on the first request, expires at the end of its interval and is shared by all workers. Identity and network limiter keys use a keyed digest. Handshake leases expire automatically. Every JSON write has an outer identity budget of 90/minute. The room snapshot and per-command permission are still authoritative in PostgreSQL.

| Action | Limit |
| --- | --- |
| New guest | 400/minute per network |
| Sign-in start | 5/minute per actor, 90/minute per network |
| Room creation / quick match | 5/10 minutes per actor |
| Join attempts or unsuccessful private-room reads | 10/minute per actor, 300/minute per network |
| Solo or relay answer | 12/25 seconds per actor per mode |
| Room commands | 10/second per actor, 80/second per room |
| Socket handshakes / live sockets | 30/minute per actor, four concurrent across replicas |
| Social writes / protected reads | 30/minute and 180/minute per actor, respectively |
| Private missing-answer reports | 5 per rolling 24 hours per actor, atomically checked in PostgreSQL |
| Bounds | 3 KiB HTTP JSON, 2 KiB socket payload, 8 KiB HTTP headers, 96-character answer, 280-character report, 100 members per group |

HTTP responds with 429 and retry time. The socket command reply includes a retry delay where applicable. When Redis is unavailable, rate-protected operations return 503. Pub/sub loss after a committed mutation can delay a live update until the next version check. An outage cannot manufacture a score. Store limits in a separate Redis deployment per environment and keep its eviction policy at noeviction. A school behind one NAT shares only the wider guest/login/join budgets. The game proxy overwrites incoming forwarding information. Production ingress security groups must prevent bypass; only the local sidecar address is trusted to set the client network address.

## Abuse limits

A ranked attempt attaches to one server-issued identity. An individual can use a new guest, an additional account, a reference book or an accomplice. Sharing captures the title, score and seven tiers using a plain link. Previously published daily questions can recur after the reservation interval. No browser game can stop a player from sharing their own screenshots. The source repository is an editorial/private artifact and contains the bank; the public artifact is the browser asset allowlist. A 100-point term is an editorial recall judgment. Anonymous popularity and clinical frequency do not enter the calculation.

Content and test authors must treat every submitted term as data. For private review, use a read-only DB transaction, inspect a bounded number of escaped records, author a future candidate, revalidate and publish under a new ID. Maintain access/audit controls around operators. Development runs use isolated databases or disposable schemas. Rotate real credentials in the managed store, revoke sessions after a suspected compromise and rerun the cross-player, group/board, CSRF and socket tests before reopening traffic.

## Local evidence

The independent reviewer exercised 36 adversarial requests and the display paths for submitted text. The fault regression kills a separate worker immediately after its accepted handoff commits, before it can publish. A connected peer recovers from the version check, and an identical retry on another worker returns the original receipt. Cutting both workers off from a private Redis forwarding socket makes readiness and protected writes return 503. After reconnection the stored epoch and score survive. The test uses isolated DB and limiter namespaces. [Independent probes](../evidence/review/security-observations.json) · [Recovery regression](../tests/recovery.test.mjs)

On 12 November 2026, npm audit reported zero known advisories in the lockfile's 24 production dependencies and 39 development dependencies. The release images pin the official Node 24.22.3 and nginx 1.30.6 multi-architecture manifests. The final detached local stack pins PostgreSQL 17.11 and Redis 7.4.12. Recheck the image digests and vulnerability feeds when preparing a later hosted rollout. [Node security release](https://nodejs.org/en/blog/release/v24.22.3/) · [nginx advisories](https://nginx.org/en/security_advisories.html) · [PostgreSQL security updates](https://www.postgresql.org/support/security/17/)

The final relay receipt check also exercised a departed host replaying its earlier successful Start. The API denies that snapshot after departure. Only the identical Leave can return its empty acknowledgment. Joining again creates a new seat identity, which invalidates old state-bearing and Leave receipts. [Independent receipt retest](../evidence/review/rejected-command-receipts.json)
