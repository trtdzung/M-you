---
type: design-decision
status: approved
created: 2026-09-07
topic: reference-resolution-normalization
refs:
  - ref-ui-msb/1.1 Home - Drop 1.png
  - ref-ui-msb/1.2 Home - Scrolling.png
  - src/components/shell/PhoneShell.tsx
---

# Normalize UI to MSB Reference Resolution

## Problem

The desktop shell is 440x956 with a 10px black bezel and synthetic Dynamic
Island. The MSB references use a 390px logical width; `1.2` is 390x844 and
`1.1` is a 4x export at 1560px wide. Existing 440px baseline makes all visual
comparison invalid: content is 12.8% too wide before spacing differences.

## Options evaluated

| Option | Result | Decision |
| --- | --- | --- |
| Fixed 440x956 device shell | Preserves current mock device; cannot match refs | Reject |
| CSS-scale a 440px interface | Fast but scales type and touch targets; brittle | Reject |
| 390px reference canvas + responsive mobile | Matches refs, preserves usable mobile layout | Approve |

## Approved design

- Desktop comparison canvas: 390x844 logical pixels.
- Mobile: no artificial device width/height; fill the actual viewport while
  retaining the same spacing and component token system.
- Remove fake physical-device chrome that is absent from the references:
  black bezel, 10px border, and Dynamic Island. Keep a reference-shaped status
  strip only.
- Centralize shell width, desktop comparison height, screen radius, safe-area,
  main inset, nav and FAB offsets as semantic CSS tokens. Pages/components must
  consume these tokens rather than independently assuming 440px geometry.
- Recalibrate Home hero/account-card overlap, carousel, bottom navigation and
  FAB at 390x844. Other routes inherit shell geometry and receive a focused
  overflow/touch-target review.
- Add visual validation at 390x844 for Home drop and scrolling states; compare
  dimensions and key anchor positions against both references.

## Constraints and risks

- Do not use `transform: scale()` as a layout solution: it harms accessibility,
  introduces coordinate bugs, and masks incorrect geometry.
- `100dvh` remains appropriate on phones; the 844px height is a desktop visual
  baseline, not a forced height on every handset.
- Existing Home claim of pixel parity must be revalidated after this baseline
  correction; it should not be used as an acceptance result.
- Preserve app invariants, route behavior, data provenance and 44px minimum
  interactive targets.

## Success metrics

- At a 390x844 viewport, no horizontal overflow; shell content width is 390px.
- No simulated bezel or Dynamic Island appears.
- Home anchor geometry (header, account card, grid, carousel/nav) matches the
  references within an agreed visual-diff tolerance.
- Mobile uses the device viewport without clipping the nav or FAB.
- Lint, build and relevant tests pass; visual snapshots cover both reference
  states.

## Next

Create an implementation plan, then implement in one focused shell/layout
change with visual verification before broad cosmetic work.
