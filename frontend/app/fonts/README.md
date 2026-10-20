# Local typefaces

Downloaded from the official Google Fonts repository on 20 October 2026:

- `Inter-Variable.ttf`: [Inter variable](https://github.com/google/fonts/blob/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf), with [Inter-OFL.txt](../../public/fonts/Inter-OFL.txt).
- `DMSerifDisplay-Regular.ttf`: [DM Serif Display / regular](https://github.com/google/fonts/blob/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf), with [DMSerifDisplay-OFL.txt](../../public/fonts/DMSerifDisplay-OFL.txt).

Both are distributed under the included SIL Open Font License. License notices are in `public/fonts` so they ship with the production image and remain accessible at `/fonts/Inter-OFL.txt` and `/fonts/DMSerifDisplay-OFL.txt`. The application loads the committed font files through `next/font/local`; the browser does not need to request them from a font service. Inter is the UI family, and DM Serif Display is limited to large display headings.
