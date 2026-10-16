# Phase 01 — Geometry Token Contract

**Status:** Complete (2026-09-07)

## Overview

Priority: P1. Establish one semantic source for reference dimensions before
any component-level tuning.

## Related files

- Modify: `E:\Documents\msb-pfm\src\app\globals.css`
- Inspect: `E:\Documents\msb-pfm\src\components\shell\PhoneShell.tsx`
- Inspect: `E:\Documents\msb-pfm\src\components\common\CategoryEditor.tsx`

## Steps

1. Replace the 440px phone-size token with semantic tokens for reference
   width (390px), desktop comparison height (844px), desktop screen radius,
   main inset, nav inset and FAB clearance.
2. Define safe-area-aware values with CSS `env(safe-area-inset-*)` fallbacks;
   do not force 844px height on real phones.
3. Locate every `max-w-phone` or hard-coded shell-width dependency; record
   which must consume the new shared width token.
4. Keep color/type/radius tokens unrelated to geometry unchanged.

## Success criteria

- No remaining 440px reference-width assumption.
- Geometry names describe intent, not a device model.
- Tokens support desktop comparison and arbitrary mobile viewport heights.

## Risks

- Tailwind v4 custom-token naming may affect generated utilities. Verify CSS
  output/build before dependent components are changed.

## Completion record

Semantic 390px reference-canvas, 844px desktop-height, inset, overlay-clearance,
screen-radius, and safe-area tokens were added to the shared stylesheet. The
former 440px device-width assumption was removed.
