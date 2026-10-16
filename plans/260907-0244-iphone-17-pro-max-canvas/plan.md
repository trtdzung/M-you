---
title: "iPhone 17 Pro Max Canvas"
description: "Render the desktop comparison canvas at the canonical 440×956 iPhone 17 Pro Max CSS viewport without geometric distortion."
status: completed
progress: 5/5 acceptance checks complete
priority: P1
created: 2026-09-07
tags: [frontend, layout, device-reference]
---

# iPhone 17 Pro Max Canvas

## Context

Apple’s iPhone 17 Pro Max layout viewport is 440×956 pt (1320×2868 px at 3×),
an exact 2.172727:1 portrait ratio. The existing 390×844 desktop comparator is
close in ratio but not the actual device viewport.

## Scope

1. Replace desktop comparison geometry tokens with semantic 440px width and
   956px height tokens; retain real mobile `100dvh` behavior and safe areas.
2. Make the desktop canvas fit shorter desktop windows by scaling uniformly or
   constraining its height from the same aspect ratio—never independently
   compressing width or height.
3. Reposition shell/nav/FAB clearance only if the new vertical extent exposes
   clipping; do not reintroduce a bezel, Dynamic Island, or route changes.
4. Capture deterministic Home states at exactly 440×956 and at a constrained
   desktop height; confirm the canvas and all overlays retain 440:956 ratio.
5. Run lint, unit tests, and production build; review the diff for unrelated
   behavior changes.

## Files

- Modify: `src/app/globals.css`
- Modify: `src/components/shell/PhoneShell.tsx`
- Inspect if required: `BottomNav.tsx`, `AssistantFab.tsx`, `page.tsx`
- Create: `plans/260907-0244-iphone-17-pro-max-canvas/reports/visual-baseline.md`

## Acceptance

- At an unconstrained desktop viewport, canvas is exactly 440×956 CSS px.
- At constrained desktop heights, displayed width and height keep 440:956
  exactly; no crop, stretch, or horizontal overflow occurs.
- At mobile widths and landscape, the app continues to fill the actual `100dvh`
  viewport rather than being forced to desktop geometry.
- The existing 390×844 reference evidence remains historical; new evidence is
  explicitly labelled 440×956.
- Lint, tests, and production build pass.

## Risks

- The taller comparison canvas can exceed common laptop heights; a uniform
  fit-to-viewport strategy is required rather than independent height clamps.
- The worktree is dirty; edit only the named files and preserve existing UI/IA
  changes.
