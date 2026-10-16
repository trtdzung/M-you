---
type: journal
date: 2026-09-07
topic: UI reference resolution normalization implementation
---

# UI Reference Resolution Implementation

## Context

The MSB comparison baseline was corrected from a simulated 440×956 device to
the supplied 390×844 reference canvas.

## What Happened

Shared geometry now defines the 390px reference width, 844px desktop comparison
height, safe-area-aware shell offsets, and common main/nav/FAB clearances. The
desktop shell no longer draws a bezel or Dynamic Island; real mobile viewports
continue to use `100dvh`.

Home was recalibrated around the reference hero and account-card anchors. Exact
390×844 captures document the initial and scrolled states, including the
observed 16px horizontal rhythm and the accepted product differences (DEMO
disclosure, three-tab IA, masked data, and AI FAB).

## Decision

Treat 844px solely as a desktop comparison canvas, not a forced mobile height.
Reference parity is evaluated through shared semantic tokens and exact-size
captures rather than scaling the former mock-device layout.

## Next

Keep the visual-baseline report with the plan and use the normal lint, test,
and production-build gates for subsequent UI changes.
