# Browser API

All URLs share the game origin. `GET /api/session` creates or resumes an opaque, HttpOnly session. It returns `actor`, `csrfToken`, optional `claim` counts, and `localLogin`. Include the cookie and same-origin `Origin` plus `X-CSRF-Token` on every JSON POST. The API limits bodies to 3 KiB. An error returns `{error}`, an HTTP status and, for a limiter, `Retry-After`. Refetch after a conflict or a lost connection. A transient failure can be retried with the identical command ID and payload. Numeric timestamps are Unix milliseconds.

| Request | Input and response |
| --- | --- |
| POST /api/login | Empty object. Returns the authorization URL. Browser navigation follows OIDC with state, nonce and PKCE. |
| GET /auth/callback | Fixed redirect URI. Exchanges the code, rotates the session, opens Account. |
| POST /api/claim | Boolean `import`. Existing account attempts win collisions. Imported overlapping runs remain private history. |
| POST /api/profile | `handle`, `listed`, `shareAnswers`. Handle collision returns 409. |
| POST /api/logout; POST /api/account/delete | Empty object for logout. Delete needs `confirm: "DELETE"`. Opens a distinct guest session. |
| GET /api/daily | Pinned issue, reset, grace and resumable run ID, including eligible carry-over from yesterday. |
| POST /api/runs | `mode`, `commandId`. Archive also requires a past `date`. Practice may take `untimed`. Opens round 1 or resumes the one ranked attempt. |
| GET /api/runs/{id} | Owner-only snapshot. Settles elapsed time on read. |
| POST /api/runs/{id}/answer, /skip, /next | `roundId`, `commandId`, plus `answer` on submit. Unknown or ambiguous stays open. A unique plausible spelling returns a suggestion the player can explicitly submit under a new key before expiry. Hit, skip or timeout produces a reveal. Advancing after round seven returns the recap. |
| POST /api/runs/{id}/report | Completed specimen log, `slot`, `text` up to 280 characters and optional `commandId`. Private, five within 24 hours. |
| GET /api/history | Private stats and paginated runs. Pass `before=nextBefore` for another page. |
| GET /api/archive; GET /api/archive/{date}/explorer | Paginated past issues and annotated published mappings. During active grace, that player's same-issue replay/explorer is locked. Known live prompts in historical alternatives have a completion guard. |
| GET /api/distribution; GET /api/boards | Optional `date` and zero-based `page` for named standings. Finish the requested issue first. |
| GET or POST /api/groups | List own groups or create one with `name`. Signed-in handle required. |
| POST /api/groups/join | `token` from seven-day private invitation. Owner can invalidate the link. |
| GET /api/groups/{id} | Member roster and eligible daily / weekly standings. |
| GET /api/groups/{id}/answers?member={actorId} | Explicitly shared completed daily, filtered to allowed rows. |
| POST /api/groups/{id}/invite, /revoke, /leave | Empty object. Invite and revoke require ownership. Leaving transfers ownership to oldest remaining member. |
| POST /api/groups/{id}/remove, /block | Target `id`. Remove requires owner. Block by a regular member hides mutual comparisons and leaves group. |
| POST /api/rooms, /api/rooms/match, /api/rooms/join | Empty object for private create or quick match. Join requires `code`. Returns a personalized room. |
| GET /api/rooms/current; GET /api/rooms/{code} | Own current seat or member-only authoritative snapshot. |
| POST /api/rooms/{code}/command | `action` (ready, start, answer, leave, rematch), integer `epoch`, opaque `commandId`, and only for answer a term. |
| WS /api/rooms/{code}/live | Same cookie, fixed Origin, current membership. Accepts the same commands up to 2 KiB. Sends personalized snapshots ordered by room version, or an error and optional retry delay. On reconnect fetch a snapshot; skip older versions and re-send a lost command using its original key. |

A run snapshot carries mode, game date, current take and round ID, deadline, server time, visible scope, result history, total and phase. It adds personal stats, alternative answers and eligible comparison data at recap. Room snapshots contain visible names, lives, meter charge, readiness, active seat, version, epoch, connection cues, and recent events. `recordedAt` on an event is its ledger stamp before commit. Neither the client nor the invitation URL carries a solution, entitlement, score or timer authority.

## Relay meter and events

Each room has `chargeTarget: 100`. A seat has a stable numeric `slot` (0–7), `lives` (0–3) and `charge` (0–99). Each accepted pass contributes 2, 3, 6, 11, 19 or 24 charge for a 10-, 15-, 30-, 60-, 85- or 100-point find respectively. An accepted pass can spend 100 for a life up to the three-life cap. It keeps the remainder. Full-health seats bank up to 99. A timeout preserves charge, while a rematch resets it.

The latest ten events are ordered by `seq`, the durable room-version cursor. Every new event includes `kind`, `text` and `recordedAt`. A `start` has `toSlot`. A `pass` adds `fromSlot`, `toSlot`, `tier`, `points`, `chargeGain` (nominal award before the cap), `chargeAfter`, `livesAfter` and boolean `bonusLife`. A `pop` names the seat that lost a life in `fromSlot`, its `livesAfter`, and the next `toSlot` or null at match end. A `forfeit` uses the same fields with zero lives. Its destination is null when the active seat stays put or the match ends. A `rematch` returns the lobby. No event contains the fuse deadline.

Render the seat snapshot after a reload and animate subsequent events once per sequence. Historical events produced by older replicas can omit slot and meter details. An older command receipt can also omit seat slots. Its charge is translated to the current units and its snapshot retains the original version.
