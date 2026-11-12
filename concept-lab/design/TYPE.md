# Penicillion typography

The chooser and playable demos serve both TrueType resources from the local origin. Every interface style uses the same upright family. The wordmark is separately drawn pixel lettering.

| Local file | Origin | License |
| --- | --- | --- |
| [pixelify-sans.ttf](../public/fonts/pixelify-sans.ttf) | Pixelify Sans 1.000 by Stefie Justprince, © 2021 The Pixelify Sans Project Authors | [SIL Open Font License 1.1](../public/fonts/OFL-Pixelify-Sans.txt) |
| [penicillion-symbols.ttf](../public/fonts/penicillion-symbols.ttf) | Penicillion Symbols 1.000, drawn on a 7-row grid for this project | [SIL Open Font License 1.1](../public/fonts/OFL-Penicillion-Symbols.txt) |

The Pixelify file is an unaltered copy of the variable font distributed by [Google Fonts](https://github.com/google/fonts/tree/main/ofl/pixelifysans). Its [upstream release source](https://github.com/eifetx/Pixelify-Sans/tree/39df74aba80df8157546034b878e8be1eb565ced) is pinned by the distributor's metadata. The bundled file has SHA-256 `9ba86cd010a4de309d263ceff8e8044092c9db7efda869620cb9ff1c4389e8a5`.

Pixelify Sans covers 574 code points, including printable ASCII, accented Latin and Cyrillic. Its weight axis runs from 400 to 700. The supplemental font supplies arrow directions, stars, a cross, result shapes and alternate hyphens. Together their character maps cover every printable character in the initial demo interface and authored instrument content. The game preserves native text selection, form controls and browser zoom.

Pixelify uses 1,000 units per em and an x-height of 450. Common regular stems span about 100 units and regular edges are optically adjusted. At 22 CSS pixels the repeated 90-unit step occupies almost two pixels. Integer font sizes, upright strokes and generous line spacing suit the study labels and facts. The supplemental symbols use 90-unit squares at the same ascent and descent.

To rebuild the original supplemental font, install FontTools 4.60.1 in an isolated Python environment and run `python concept-lab/design/build-symbol-font.py`. Playing the game does not require FontTools.
