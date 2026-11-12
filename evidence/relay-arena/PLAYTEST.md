# Slide Relay playtest

Independent review on November 12, 2026. Chrome played the final port 4320 build in private two-, five- and eight-player rooms. Each seat had its own browser storage and live connection. Meter fixtures, a full Duel and a cross-browser Quick match used a separate local database. An ordinary timed solo Practice answer scored 15 and advanced to a new prompt on the final build.

## Around the table

- The two keepers faced across the desktop bench. Five independent guests appeared as two upper players, one on each side and one at the bottom, matching the supplied formation. Eight guests completed a full circuit back to seat one. Their plates showed individual lives and charge, and the phone's input enabled on its turn. [Earlier Duel](before-duel.png) · [Current Duel](duel.png) · [2016-pixel desktop](wide-duel.png) · [Five keepers](table-5.png) · [Eight keepers](table-8.png)
- An accepted Specialist answer carried the hovering slide to the next keeper. A reused answer and an unknown answer kept it with that keeper. The film follows the pass and the last moments of that same fuse. The slide enlarged, its culture filled in, and it broke above the holder. That player dropped to two lives. The other player received a new category. The clip omits the intervening wait. [Handoff and pop](handoff-and-pop.gif) · [Three frames of the pop](pop-sequence.png)
- The Duel ran to a last survivor through natural timeouts. A rematch reset both players to three lives and zero charge. Reloading in an active eight-player game preserved the turn and the meters. A separate five-player last-life fixture left the eliminated keeper in place, reopened their seat as a spectator and handed the slide around the four survivors.
- WebKit 26.5 at 390 × 844 and Chrome 157 on desktop paired through Quick match, exchanged two answers and returned the slide to the WebKit player. Keyboard Enter submitted from each active seat. Reduced motion and Static scenery displayed the current state with a stationary canvas while the same keeper held the slide.

## Earning back a life

Nine controlled cases used a separate local database, with real accepted answers and simultaneous duplicate requests. Charge gains measured 2, 3, 6, 11, 19 and 24 in ascending rarity order. At two lives, 80 plus a Specialist reached 99 without awarding a life. At one life, 94 plus a Specialist awarded one life and retained 13 charge. At three lives a full bank held at 99. Every duplicate command committed one pass.

I also played two prescribed refill sequences through the live service. Five Specialist passes left the meter at 95. A Classic and a Clever raised it to 100 and restored one life. Four Specialists plus four Students also restored one. The fixture shortened categories between the player's turns so each pass could use an unused accepted answer. A 320-pixel phone separately displayed the recovered life after a real Specialist pass from 93 charge. [Recovered life](phone-life-recovered.png)

## Responsive issues and retests

The initial live screen placed the answer controls below the fold at 844 × 390, and only 13 pixels of the Pass button showed in an eight-player room at 360 × 740. Moving the landscape controls beside the table and reserving room for the phone input corrected those cases. A follow-up check found overlapping plates at 320 × 568. The retest kept the input above the board on short portrait screens and let players scroll to the lower keepers. At 320 × 568, 360 × 740 and 844 × 390, all eight maximum-length names stayed within their plates, and the plates had no intersections. In the compact formation longer names can be truncated on the plate; the roster retains the full names. [Phone](phone-8-holding.png) · [Landscape](landscape.png)

At 667 × 375, the first layout left only 55 pixels for the answer. Its corrected input measures 175 pixels in two- and eight-player games. The scope disclosure opened without covering Pass, and the field accepted typing after it closed. [Narrow landscape](narrow-landscape.png)

A separate read-only SQL check of the final 90-second benchmark agreed with each of the 1,692 pass awards and all 502 stored seat balances. It counted 458 pops and one earned life. [Benchmark report](../load/relay-meter.md)

Mobile and keyboard-height checks used browser emulation. Timing came from the loopback server. [Recorded measurements](measurements.json)
