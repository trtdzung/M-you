# Visual baseline — 390×844

Captured 2026-09-07 with local Chrome 152, viewport `390×844`, DPR 1 and the
deterministic **Minh** mock persona after onboarding.

| State | Capture | Scroll | Measured anchors |
| --- | --- | ---: | --- |
| Initial/drop | [home-initial-390x844.png](home-initial-390x844.png) | 0px | Hero/card overlap begins at y=318; card x=16 and width=358. |
| Scrolled | [home-scrolled-390x844.png](home-scrolled-390x844.png) | 210px | Account card x=16, y=108, 358×125; quick grid follows at the shared 16px rhythm. |

`1.2 Home - Scrolling.png` is the exact 390×844 comparator. Its account-card
anchor is approximately x=16, y=108, width=358 and height=122; the capture is
within 3px in height and exact on the other recorded anchors. `1.1 Home - Drop
1.png` is 1560×3784 (a 4× tall scroll capture), so it was used for initial hero
composition only—not as a 844px viewport target.

Accepted intentional differences: the prototype retains the required DEMO
disclosure, 3-tab IA, masked mock account details, and AI FAB. These are product
requirements outside reference-raster parity. No simulated bezel or Dynamic
Island is present.

Responsive checks after the final shell correction: a 667×375 landscape mobile
viewport retains a 667×375 app shell (no fixed-canvas clipping); a 1024×900
desktop viewport centers the 390×844 comparison canvas at x=317, y=28.
