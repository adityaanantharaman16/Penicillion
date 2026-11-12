# Independent concept playtest

Reviewed the two playable studies as separate guests on November 12, 2026. Each study has two unranked takes of the same surgical-instrument question. The review used the running loopback HTTP service, its SQLite guest state and Chrome 157.0.8103.78. Desktop was 1440 × 900. Phone was a touch-enabled, 360 × 740 Chrome viewport with the system reduced-motion preference. A shortened 360 × 442 viewport also kept the complete Submit button visible. A physical phone and its native keyboard remain unverified.

| Flow | Browser observation |
| --- | --- |
| Cold entry and scope | Each chooser link opened its own illustrated bench. Play as guest opened the first 25-second take. The question specified handheld tools and excluded implants, loose blades and supplies. |
| Submit and retry | An invalid qualifier in “scalpel implant” left the take open. “SURGICAL   knives” matched Scalpel at 10 and “rongeur” earned 85 on all four plays. Each reveal showed an original fact, tier and source. |
| Controls and award | Enter submitted the first answer and advanced the held reveal to take two. The miniature log listed both accepted terms, their tiers, and 95 / 200. The result survived a refresh. The sound default was off and system reduced motion rendered settled rewards on phone. |
| Clock and other tabs | Refresh preserved the open take's deadline and ID. After a real 25-second wait, two tabs saw one timeout. A stale next action reconciled to the open second take. A skip there remained authoritative when the other tab submitted an answer. Both zero-point outcomes survived to recap. |
| Replay and spelling | Replay started a fresh take. “Gigli’s saw” earned 100 and “HAEMOSTAT” earned 15. |
| Layout and settings | Played Night Culture in 740 × 360 landscape. Played it again in a fresh Chrome profile at actual 200% browser zoom, giving 720 CSS pixels across a 1440-pixel window. Forms and recap remained usable without horizontal scrolling. Sound and static-scene preferences survived a refresh. |
| Independent checks | The six server and content tests passed, including a real loopback HTTP boundary check, restart persistence, scoped aliases, exact-deadline behavior, privacy of internal files and rejection of a fabricated score. |

The final desktop prompt plaque remained above the microscope and clear of the side labels while the answer form stayed below. The phone version placed the question beside the entry area. The top-tier Night Culture reward added a visible coral arch, and the canvas description named the arch.

The point display can be covered and the rewards still read at 360 pixels. In Glass Atlas the single small form in the dark circular field gives way to a mounted cream atlas plate with several ringed structures. The camera change recalls the cut between frames 8 and 10 of TopBinz. In Night Culture the keeper, lamp and glass edge stay put while a small patch sends out roots and tall branched stalks. That fixed reference point serves the same purpose as the horizon in Eraly frames 15–17. The bottom answer controls leave the main silhouettes visible, as in Krillion frames 3–5.

## Issues and retests

| ID | Severity / owner | Reproduction and expected behavior | Fix and verification |
| --- | --- | --- | --- |
| C-01 | Minor / content | Submit rongeur and open its source. The original text said the scoop catches each piece. The cited filing documents compression and cutting. | Reworded in concept-instruments.2. Four fresh browser plays showed the supported mechanical detail. The scalpel wording now also matches the ACS blade-size comparison. |
| V-02 | Minor / art and integration | In Night Culture, submit scalpel then rongeur and open the log. Its text lists two entries, but the art initially lit only well 1. Each played well should reflect its own result. | Fixed and replayed on desktop and phone. The first two wells now match the accepted answers in order. Reversing the answers reversed the marks and retained the branches. Skipping the second take preserved the first rare colony and the 85-point total. Compare [before](V02-before.png) and [after](B-phone-recap.png). |
| T-03 | Minor / interface | With the revised type, shorten the focused phone viewport to 360 × 442. The bottom eight pixels of Submit fell below the viewport. The entire button should stay visible. | The short prompt now collapses the masthead and uses a smaller scene. In a fresh browser session Submit occupied y=330–380 and the top-tier answer submitted successfully. |

## Pixel typography revision

Replayed both directions from the chooser through the specimen log on desktop and phone. Chrome's DevTools font inspection reported Pixelify Sans for authored text and Penicillion Symbols for the five tested typed symbols. Across 32 screen-state checks and 830 text-element observations, no system font rendered any tested glyph. Coverage included the empty input and its placeholder, typed text, buttons, labels, countdown, invalid and blank entry feedback, retry after a simulated connection failure, common and specialist facts, open source notes and “Yankauer suction tube” in the log. All four guests finished the two-take study and the 200% zoom replay passed. All screen captures use the revised typography except the historical V02-before.png. [Per-view rendered font counts](typography.json)

The reviewer checked the source relationship and the demo scoring rationale for the three anchor instruments. A scalpel's name comes immediately to mind for many players. Remembering a rongeur calls for recalling a named tool for bone work. The flexible wire and handles make the 100-point Gigli saw a distinctive find. These are editorial judgments about recall. Source material includes the [ACS instrument guide](https://www.facs.org/media/wgcmalet/common_surgical_instruments_module.pdf), [FDA-filed rongeur summary](https://www.accessdata.fda.gov/cdrh_docs/pdf13/K131851.pdf) and [Red Cross Gigli saw entry](https://itemscatalogue.redcross.int/detail.aspx?from=kit&itemcode=XSINMEDI576402).

The seven-prompt daily, accounts, friends, relay, production hardening and capacity checks belong to the later integrated game review.

All concept-stage issues in this record passed their browser retest.
