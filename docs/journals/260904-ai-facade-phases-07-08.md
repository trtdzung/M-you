---
type: journal
date: 2026-09-04
topic: Polish/states/motion (Phase 07) + assisted transfer drafting (Phase 08) of the AI-native facade migration
---

# Phases 07-08 Complete — Facade Migration Done

## Context

Continuation of `plans/260903-1552-ai-native-facade-migration/`. Phases 01-05
(AI facade, Tier A tools only) and 06 (UX overhaul) were already in place.
This session deepened the two remaining outline phase plans into
implementable specs against the actual codebase, implemented both in
parallel via multi-agent dispatch, then ran an adversarial code review pass
before closing the plan.

## What changed

**Phase 07 — polish, states, motion, a11y**
- Reskinned the 4 state components (empty/loading/error/insufficient-data) to
  borderless MSB cards; new `Skeleton` shimmer primitive.
- Motion utilities with mandatory `prefers-reduced-motion` support — no
  animation ships without the reduced-motion guard.
- Provenance sweep: added `Freshness` display on multi-source cashflow
  aggregates. Deliberately did **not** attach a single `SourceBadge` to
  multi-source data — a single badge would misrepresent a blended
  `msb`/`self_reported`/`estimated` aggregate as one provenance, violating
  invariant #5 (every number carries accurate provenance; never imply
  bank-verified when it isn't).
- Accessibility: ≥44px touch targets, focus-visible rings, chart labels for
  screen readers.

**Phase 08 — assisted transfer drafting (Level 3, EPIC-13)**
- New `TransferDraft` + `Beneficiary` models and `BeneficiaryDataProvider`,
  consistent with the existing provider-interface pattern (invariant #4).
- Tier B tools (`findRecipient`, `prepareTransferDraft`) added in
  `src/ai/tools/draft-tools.ts` but **kept out of the LLM tool schema**;
  they're invoked deterministically by `src/ai/pipeline/action-pipeline.ts`
  based on parsed intent, not by LLM tool-choice. This is a direct
  consequence of invariant #2/#3: the LLM must never be in a position to
  decide to move money or fabricate a recipient — determinism has to own the
  decision to draft, the LLM only narrates.
- Feature flag `ENABLE_TRANSFER_DRAFTING` (default ON in prototype).
- Threshold re-confirm (10M VND) plus a fraud checkpoint (new payee + large
  amount + urgency language) — both enforced deterministically, not by LLM
  judgment.
- `DraftCard` in chat, and an out-of-facade mock confirm screen at
  `src/app/transfer-confirm/*` that simulates the native MSB
  confirm/OTP flow the facade is not allowed to touch.
- Safety/attack tests covering prompt-injection-style attempts to get the
  assistant to execute or auto-confirm a transfer.
- Recipients only ever come from saved beneficiaries, explicit user input,
  or the user's own transaction history — never fabricated account numbers;
  only masked references cross to client/audit surfaces.

## Adversarial review findings (both fixed)

- **Critical:** `isTransferConfirmation`
  (`src/ai/pipeline/action-pipeline.ts`) scanned the *entire* chat history
  with `.some()` to detect an affirmation ("ok", "yes"). That meant an
  unrelated later "ok" in conversation could finalize a **stale**
  over-threshold draft, silently defeating the PFM-132/133 re-confirm gate —
  a real safety hole given invariant #3 (no autonomous money movement,
  threshold re-confirm is load-bearing). Fixed by requiring turn-adjacency:
  the affirmation must directly answer the immediately preceding transfer
  request, not any prior one. Regression test added.
- **Warning:** `parseAmount` (`src/ai/pipeline/action-parse.ts`) could
  misread a dot-grouped account number as the transfer amount. Fixed by
  stripping any explicitly typed account number before amount parsing, plus
  a Unicode-safe currency-boundary fix for the "đ" unit suffix. Tests added.

## Verification

125 tests pass, lint 0 errors/0 warnings, `npm run build` clean (0 errors).

## Docs / plan sync

- `plans/260903-1552-ai-native-facade-migration/plan.md` — all 8 phases now
  marked DONE; migration complete.
- `docs/ARCHITECTURE.md` / `docs/PRODUCT.md` — updated to describe Tier B
  (assisted transfer drafting) as shipped, not planned.

## Open item (not a bug, flagged for product sign-off)

The mock confirm screen (`src/app/transfer-confirm/*`) intentionally shows
only the masked account number (mask-only client projection, per plan) — a
product decision to confirm, not an engineering gap.
