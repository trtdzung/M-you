# Phase 03 — Home Reference-Anchor Calibration

**Status:** Complete (2026-09-07)

## Overview

Priority: P1. Tune the Home composition only after the shell is stable.

## Related files

- Modify: `E:\Documents\msb-pfm\src\app\page.tsx`
- Modify as measured: `E:\Documents\msb-pfm\src\components\shell\HomeHeader.tsx`
- Modify as measured: `E:\Documents\msb-pfm\src\components\home\AccountSummaryCard.tsx`
- Modify as measured: `E:\Documents\msb-pfm\src\components\common\QuickActions.tsx`
- Inspect: `PromoCarousel.tsx`, `PromoCard.tsx`, `Dots.tsx`, `BrandWatermark.tsx`

## Steps

1. Capture Home at 390x844, then compare header, hero, card-overlap, quick
   grid, carousel, nav and FAB to `1.2 Home - Scrolling.png`.
2. Adjust only measured spacing/radius/type values; prefer shared tokens over
   page-local magic numbers.
3. Compare logical-width anchor regions of the tall 4x `1.1 Home - Drop 1`
   capture; do not mistake its long capture height for a device viewport.
4. Preserve masked account data, hidden-by-default balance and all interactive
   targets/links.

## Success criteria

- Home has the same 390px composition, not a scaled 440px approximation.
- Content remains scrollable and no card is obscured by nav/FAB.
- No presentation component imports fixtures or changes financial behavior.

## Risks

- Dynamic text/personas prevent literal pixel equality. Validate fixed mock
  state and anchor geometry rather than inventing/fixing data to match images.

## Completion record

Home was recalibrated to the 390px composition using the shared shell geometry.
The account-card overlap, quick-action grid, hero, carousel, floating nav, and
FAB retain scroll access and the existing masked financial data behavior.
