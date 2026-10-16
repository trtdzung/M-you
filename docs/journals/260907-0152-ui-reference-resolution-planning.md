---
type: journal
date: 2026-09-07
topic: UI reference resolution normalization planning
---

# UI Reference Resolution Planning

## Context

Approved baseline: 390×844 logical viewport, matching `ref-ui-msb`.

## Decision

Current desktop shell is 440×956 with a 10px bezel, rounded mock device and
fake Dynamic Island. That changes geometry, so parity against the reference is
invalid. Normalize shared shell tokens/chrome instead of CSS-scaling the old
screen; scaling would distort type and touch targets.

## Plan

Implementation is sequenced: geometry tokens → shell/overlays → Home anchors
→ exact-size visual evidence → regression acceptance. Mobile stays viewport
filling; 844px is a desktop comparison baseline only.

## Next

Execute [the resolution plan](../../plans/260907-0152-ui-reference-resolution/plan.md)
after review; preserve unrelated dirty worktree changes.
