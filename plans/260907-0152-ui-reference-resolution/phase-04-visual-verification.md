# Phase 04 — Visual Verification Baseline

**Status:** Complete (2026-09-07)

## Overview

Priority: P1. Make reference conformance reproducible without prematurely
adding a visual-test dependency.

## Related files

- Create: `E:\Documents\msb-pfm\plans\260907-0152-ui-reference-resolution\reports\visual-baseline.md`
- Inspect: `E:\Documents\msb-pfm\ref-ui-msb\1.1 Home - Drop 1.png`
- Inspect: `E:\Documents\msb-pfm\ref-ui-msb\1.2 Home - Scrolling.png`
- Inspect: `E:\Documents\msb-pfm\src\app\__tests__\routes.smoke.test.tsx`

## Steps

1. Use an exact 390x844 browser viewport and deterministic mock state.
2. Capture initial/drop and scrolled Home states; compare against references
   by overlay or side-by-side at identical logical width.
3. Record viewport, browser, scroll offset, screenshots and measured anchors
   in the phase report.
4. Decide whether manual evidence is sufficient. Add Playwright only if this
   check will recur in CI; otherwise avoid a new dependency.

## Success criteria

- Evidence distinguishes 390x844 viewport from the tall 4x capture.
- Visual deviations and accepted tolerances are explicit and reviewable.

## Risks

- Font loading and browser rendering cause minor raster differences. Compare
  geometry and capture after fonts settle.

## Completion record

Exact 390x844 initial and scrolled Home captures, measured anchors, comparator
interpretation, responsive checks, and accepted deviations are recorded in
[`reports/visual-baseline.md`](reports/visual-baseline.md).
