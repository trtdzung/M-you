---
title: "MSB Reference Resolution Normalization"
description: "Normalize the shell and Home layout to the 390x844 MSB reference baseline."
status: completed
progress: 5/5 phases complete
priority: P1
effort: 10h
branch: main
tags: [frontend, refactor, critical]
blockedBy: []
blocks: []
created: 2026-09-07
supersedes: 260906-2057-msb-ui-pixel-parity-redesign resolution acceptance
---

# MSB Reference Resolution Normalization

## Overview

Correct the presentation baseline only: reference canvas is 390x844, not the
existing 440x956 mock device. Preserve routes, financial data contracts and
the completed 3-tab IA. Worktree is already dirty: edit only named files.

## Phases

| Phase | Name | Status |
| --- | --- | --- |
| 1 | [Geometry token contract](phase-01-geometry-tokens.md) | Complete |
| 2 | [Shell chrome and overlay alignment](phase-02-shell-overlays.md) | Complete |
| 3 | [Home reference-anchor calibration](phase-03-home-calibration.md) | Complete |
| 4 | [Visual verification baseline](phase-04-visual-verification.md) | Complete |
| 5 | [Regression and acceptance](phase-05-regression-acceptance.md) | Complete |

## Dependencies

1 → 2 → 3 → 4 → 5. Do not parallelize: each stage relies on stable geometry
from the prior stage.

## Scope boundary

Included: shell dimensions/chrome, Home geometry, shared overlay offsets and
visual verification. Excluded: feature/route changes, financial calculations,
new product behavior, and automated visual-test infrastructure unless manual
exact-size capture proves insufficient.

## Acceptance

- Desktop reference canvas is 390x844; mobile keeps real `100dvh` behavior.
- No black device bezel or Dynamic Island appears.
- Home aligns against both provided references at logical 390px width.
- Nav/FAB stay accessible without clipping; interactive controls remain ≥44px.
- Lint, unit/smoke tests and production build pass.

## Completion

Completed 2026-09-07. The implementation is recorded in the five phase files;
the reproducible 390x844 capture evidence is in
[`reports/visual-baseline.md`](reports/visual-baseline.md).
