# Phase 02 — Shell Chrome and Overlay Alignment

**Status:** Complete (2026-09-07)

## Overview

Priority: P1. Apply the new contract to shared screen chrome without changing
routes or page content.

## Related files

- Modify: `E:\Documents\msb-pfm\src\components\shell\PhoneShell.tsx`
- Modify: `E:\Documents\msb-pfm\src\components\shell\StatusBar.tsx`
- Modify: `E:\Documents\msb-pfm\src\components\shell\BottomNav.tsx`
- Modify: `E:\Documents\msb-pfm\src\components\shell\AssistantFab.tsx`
- Modify if width-bound: `E:\Documents\msb-pfm\src\components\common\CategoryEditor.tsx`
- Inspect: `E:\Documents\msb-pfm\src\components\shell\DemoBadge.tsx`

## Steps

1. Make the desktop shell a 390x844 visual canvas; mobile fills its viewport.
2. Remove simulated hardware absent from the references: black border/bezel,
   device shadow treatment and Dynamic Island. Retain a compact status strip.
3. Move main padding, floating nav and FAB positioning to the geometry token
   contract; account for safe areas and prevent overlap with scroll content.
4. Apply shared desktop-width behavior to `CategoryEditor` and audit the DEMO
   badge against the new shell bounds.

## Success criteria

- At 390x844, no horizontal scroll, clipping or simulated device hardware.
- Nav and FAB are fully visible at 390x844 and on shorter/taller mobile views.
- Existing route behavior and accessibility labels are unchanged.

## Risks

- Absolute overlays can hide bottom page actions. Verify each route before
  proceeding to Home calibration.

## Completion record

The shared shell now uses the 390x844 desktop comparison canvas while mobile
uses its real dynamic viewport. Simulated bezel, device shadow, and Dynamic
Island were removed; shell padding, nav, and FAB consume shared geometry and
safe-area offsets.
