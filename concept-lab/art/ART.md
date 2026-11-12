# Penicillion concept art

Both studies use a 152-pixel-high drawing surface. Width follows the frame, so the central props stay in view as the sides of the room move offscreen. The interface owns the sharp text and buttons. Pixel shapes, sprites, scene ornament and synthesized sound were drawn or composed for these studies. The reference atlas informed staging and timing. Its pixels do not appear in these assets.

## Glass Atlas

| Ink | Glass | Paper | Brass | Iodine shadow |
| --- | --- | --- | --- | --- |
| `#252e31` | `#90b7af` | `#f4e4bd` | `#efc674` | `#89582f` |

1. **Landing.** A microscope and its moth sit between books, stain bottles and an open folio. The window reveals a pale moon and three ridges. The coarse focus wheel catches the light.
2. **Prompt.** The player stays at the desk. The moth occasionally opens its wings. After a discovery, its slide remains on the desk. A high cumulative score leaves a miniature plate on the folio.
3. **Reveal.** The objective clicks down two pixels. A closing shutter carries the camera into the slide. The first small award resolves one section in the dark lens. At 60 cumulative focus steps, the lens is mounted on paper and reveals several engraved sections with pen leaders. Above 90 steps another profile appears. An individual 100-point answer seals the plate with a two-tailed rosette.
4. **Recap.** The final field remains readable with the log open. The optical rail uses the study's 200-point maximum. The etched shapes are fictional specimens.

## Night Culture

| Ink | Cabinet | Sea glass | Colony | Scarf |
| --- | --- | --- | --- | --- |
| `#171c29` | `#293646` | `#70ceac` | `#d9edbf` | `#ee957d` |

1. **Landing.** A small keeper holds an inoculation loop over a Petri dish. A hanging lamp, back shelves and a recessed incubator set the size of the room. A mature starter shows what the dish can hold.
2. **Prompt.** The sample starts with a few grains and small colonies. The keeper blinks and shifts its weight. An existing culture carries through to the next take.
3. **Reveal.** A central colony swells over 0.86 seconds. More cumulative growth sends hyphae from its edges, then brush-shaped stems rise and the incubator brightens. An individual 100-point find grows a coral-tipped arch. A marked well remembers each take; a dash records a miss or skip.
4. **Recap.** The final colony and marked wells remain on the bench. A modest second find, skip or timeout preserves growth from the first take.

## Sprites and sound

The four-frame [sprite strip](../design/sprites.svg) contains the keeper and moth at native scale. Each frame is 64 pixels wide. The keeper occupies the top row, the moth the lower row. Run `node concept-lab/design/render-sprites.mjs` to regenerate it from their drawing functions.

Static mode uses the settled pose without the shutter, travelling filaments, floating spores or blinking. The artwork receives a snapshot of points and take results. It cannot change a score or start a timer. Each room has its own brief Web Audio motif. The host enables the audio context on a player gesture and can mute it at any time. The artwork uses synthesized sound and draws its own small well numbers. The interface fonts and licenses are listed in the [type notes](../design/TYPE.md).
