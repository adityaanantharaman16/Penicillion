# Penicillion typography

The game screens serve both TrueType resources from the local origin. Every interface style uses the same upright family. The wordmark is separately drawn pixel lettering.

| Local file | Origin | License |
| --- | --- | --- |
| [pixelify-sans.ttf](../fonts/pixelify-sans.ttf) | Pixelify Sans 1.000 by Stefie Justprince, © 2021 The Pixelify Sans Project Authors | [SIL Open Font License 1.1](../fonts/OFL-Pixelify-Sans.txt) |
| [penicillion-symbols.ttf](../fonts/penicillion-symbols.ttf) | Penicillion Symbols 1.100, drawn on a 7-row grid for this project | [SIL Open Font License 1.1](../fonts/OFL-Penicillion-Symbols.txt) |

The Pixelify file is an unaltered copy of the variable font distributed by [Google Fonts](https://github.com/google/fonts/tree/main/ofl/pixelifysans). Its [upstream release source](https://github.com/eifetx/Pixelify-Sans/tree/39df74aba80df8157546034b878e8be1eb565ced) is pinned by the distributor's metadata. The bundled file has SHA-256 `9ba86cd010a4de309d263ceff8e8044092c9db7efda869620cb9ff1c4389e8a5`.

Pixelify Sans covers 574 code points, including printable ASCII, accented Latin and Cyrillic. Its weight axis runs from 400 to 700. Penicillion Symbols supplies the score shapes and a full set of equally wide numerals. The game uses these numerals for all browser text, including the clock, run totals, inputs and standings. The 5 has a flat top and an open upper right, the 1 has a foot, and the 0 has a center dot. Both fonts preserve native text selection, form controls and browser zoom.

Pixelify uses 1,000 units per em and an x-height of 450. Common regular stems span about 100 units and regular edges are optically adjusted. At 22 CSS pixels the repeated 90-unit step occupies almost two pixels. Integer font sizes, upright strokes and generous line spacing suit the study labels and facts. The supplemental symbols use 90-unit squares at the same ascent and descent.

To rebuild the original supplemental font, install FontTools 4.60.1 in an isolated Python environment and run `python web/design/build-symbol-font.py`. Playing the game does not require FontTools.

The frozen bank, source labels, local sign-in page, interface modules and seven share marks are checked against both shipped Unicode character maps by `node --test tests/pixel-type.test.mjs`. The tier silhouettes in ascending order are disc, linked pair, triangle, cross, diamond and star.
