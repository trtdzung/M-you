---
type: journal
date: 2026-09-07
topic: iPhone 17 Pro Max canvas completion
---

# iPhone 17 Pro Max Canvas

## Context

The desktop comparison shell now uses the canonical iPhone 17 Pro Max logical
viewport: 440×956pt (1320×2868px at 3×).

## What Happened

Semantic device dimensions replaced the previous single phone-width token.
The desktop canvas is 440×956, scales uniformly when a desktop window is too
short, and does not simulate physical device hardware. Mobile still fills its
real `100dvh` viewport.

## Decision

Shared safe-area-aware main, navigation, and FAB offsets keep overlay clearance
consistent across the full logical canvas and real mobile devices.

## Next

Use the canonical 440×956 canvas for future desktop visual comparisons; retain
the standard lint, test, and production-build gates for follow-up UI work.
