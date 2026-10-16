# iPhone 17 Pro Max canvas baseline

Browser verification on local Chrome, 2026-09-07:

- [Home at 440×956](home-440x956.png) — deterministic Minh persona after consent.
- [Home in a 1024×500 desktop window](home-constrained-1024x500.png) — full
  canvas remains visible under uniform scale.

| Browser viewport | Canvas result | Expected result |
| --- | --- | --- |
| 1440×1100 | 440×956, centered at x=500, y=72 | Exact iPhone 17 Pro Max CSS viewport |
| 1024×500 | 215.391×468, centered at x=404.297, y=16 | Full 440×956 canvas at uniform 0.48954 zoom |
| 667×375 | 667×375 | Real mobile/landscape viewport; no desktop canvas |

The constrained desktop preview applies the same **0.48954 scale factor** to
the full canvas and its children. Its **width:height aspect ratio** stays
440:956 (0.460251), without crop, reflow, or independent stretching. Device
source: Apple HIG, 440×956 pt / 1320×2868 px at 3×.
