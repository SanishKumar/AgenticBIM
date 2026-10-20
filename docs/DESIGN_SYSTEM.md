# Trace studio interface

The 20 October 2026 redesign applies the supplied VEED style reference to a working IFC review desk. It uses a white canvas, warm near-black text, a dark summary strip, rounded media frames and a single lime action color. The model remains the main visual; the interface uses actual IFC geometry instead of decorative renders or stock imagery.

## Palette and hierarchy

| Token | Value | Use |
| --- | --- | --- |
| `--color-paper` | `#ffffff` | Page, cards and controls |
| `--color-carbon` | `#0c0a09` | Primary text, selected segmented controls and export action |
| `--color-onyx` | `#121212` | Full-width summary band inside the workspace |
| `--color-mist` | `#f2f1f0` | Model stage and secondary surfaces |
| `--color-fog` | `#e6e6e7` | Borders and dividers |
| `--color-smoke` | `#71737a` | Secondary text on white |
| `--color-slate` | `#4d4d51` | Secondary text on tinted surfaces |
| `--color-lime-spark` | `#96ff1a` | Primary actions, active navigation and selected/current geometry |
| `--color-forest-ink` | `#083300` | Lime action text and outlines |
| `--color-mint-mist` | `#e6ffc8` | Selected finding rows and drag targets |

Other supplied neutral and green tokens remain available in the stylesheet. Exclusions and review states use words, icons and border treatments. Their meaning survives the monochrome palette. Baseline geometry is gray; current geometry is lime. Baseline-only mode raises its opacity for inspection.

## Type and geometry

Inter handles functional text. DM Serif Display is reserved for page-level display headings at 40–54 px. These are the open-source substitutes suggested by the reference; the original SwissNow and PP Editorial New fonts are not bundled. Fonts are committed locally in [`frontend/app/fonts`](../frontend/app/fonts/) and loaded with `next/font/local`. Their SIL Open Font License notices ship in [`frontend/public/fonts`](../frontend/public/fonts/).

- [Inter source](https://github.com/google/fonts/tree/main/ofl/inter), variable weight 100–900; the interface mainly uses 400, 500 and 600.
- [DM Serif Display source](https://github.com/google/fonts/tree/main/ofl/dmserifdisplay), regular 400.

The canvas is capped at 1,200 px. Cards use 16 px corners, compact controls use 10 px corners, and navigation uses true pills. Surface contrast and hairline borders separate content. Cards have no drop shadows. Large display text has tight negative tracking; units and technical identifiers keep compact, readable spacing.

## Workspace behavior

The top navigation keeps model review, the ledger and revision comparison together. Project switching sits above the page heading. Assumptions and IFC import are visible beside the heading; export, recovery and methodology remain available in the header.

The model and evidence inspector share a row on larger screens. On narrow screens they stack, revision entries become a horizontal strip, and the quantity table scrolls inside its own container. Finding rows retain their impact and review status when the desktop columns collapse. Material-rate inputs stack on phones, while the dialog heading and Apply action stay visible.

Interactions use short CSS transitions and restrained entrances. Floor separation and orbit damping retain the existing demand-driven renderer. Reduced-motion preferences disable entrance movement and use immediate panel navigation. Native modal dialogs trap keyboard focus, support Escape when idle, and return focus to the initiating control.

The implementation lives in [`globals.css`](../frontend/app/globals.css), [`workspace.tsx`](../frontend/components/workspace.tsx), [`dialog.tsx`](../frontend/components/dialog.tsx) and [`model-viewer.tsx`](../frontend/components/model-viewer.tsx). Browser verification and capture provenance are recorded in [VERIFICATION.md](VERIFICATION.md) and [MEDIA.md](MEDIA.md).
