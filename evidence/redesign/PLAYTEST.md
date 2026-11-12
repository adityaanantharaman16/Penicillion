# Night Culture redesign playtest

Independent review of the final local build on port 4320, November 12, 2026. All runs used separate guest sessions in unranked practice. The recording shows the common reveal, advancing to a new slide, entering an answer and the Specialist growth. [Five-second recording](slide-and-reveal.gif)

## Screen and controls

At 2016 × 1148, the illustrated stage now spans 2016 × 820 pixels and begins 111 pixels below the top. The prior stage measured 1076 × 385 and began 219 pixels down. The question stays on the stage and the answer controls sit together in the dock below it. At 1440 × 900 the stage spans 1440 × 572. [Earlier wide screen](before-desktop.png) · [Current wide screen](wide-prompt.png) · [Laptop](laptop-prompt.png) · [Phone](phone-prompt.png)

Across four consecutive desktop questions, the dark question slide rose 202–204 pixels while fading into view. The answer field remained editable and stayed at the same coordinates throughout each transition. A rejected answer preserved the timed round’s deadline. All six advances in a seven-round timed run opened with 25 seconds remaining. In a separate interruption test I immediately advanced during a +100 reveal, typed into the next question and verified the text survived the previous animation’s full duration.

## Score and growth

The seven submissions scored 10, 15, 30, 60, 85, 100 and 15. The recap totaled 315 and named the strongest find. Round numbers appear on a separate line above the point award. I could distinguish +15, +85 and +100 on desktop and phone. The six named tiers also use distinct marks and colors. Label contrast measured 5.35:1 to 6.86:1. [Wide +15](wide-15.png) · [Phone +15](phone-15.png) · [Phone +100](phone-100.png) · [Recap](wide-recap.png)

The common growth stays small. At higher tiers the bench darkens, the camera draws close to the active filament and each result leaves a distinct shape. Resident spreads into a low lilac fan, Specialist raises an amber canopy, and “Are you a doctor?” grows a coral fruit above paired stems. The completed growth remained visible with reduced motion or Static scenery enabled. [Resident](wide-60.png) · [Specialist focus](specialist-focus.png) · [Specialist settled](wide-85.png) · [Top tier](wide-100.png)

## Compact screens and engine coverage

Chrome accepted 22 answers across eight sessions covering 2016 × 1148, 1440 × 900, 1366 × 768, 360 × 740, 320 × 568, 360 × 442 and 844 × 390. The form stayed at the same height across each phone’s questions. The field and submit button fit the short focused viewport. Long facts on small phones require vertical scrolling to reach Next. No measured prompt or reveal overflowed horizontally.

WebKit 26.5 at 360 × 740 and Firefox 151 at 1366 × 768 also accepted +15 and +100 and advanced to the following question. Phone and keyboard-height checks used emulation. [Measurements](measurements.json)
