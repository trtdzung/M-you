# 2026-09-16 — AI-suggested transfer purpose

## What changed

Added a second, independent label dimension for self-reported `type:"transfer"`
transactions: not "what category is this" but "why did I send this money."

- **New taxonomy** (`src/domain/models/transfer-purposes.ts`): `family`, `savings`,
  `debt`, `self`, `gift`, `business`, `other` (non-spending, pure metadata) plus
  three hybrid purposes that map onto real spend categories on confirm —
  `rent → housing`, `bill_split → dining`, `pay_goods → shopping`. Deliberately
  kept OUT of the spending `CATEGORIES` list so it can never be confused with,
  or silently merged into, a spending category. Each `TransferPurposeDef`
  self-declares `spending: boolean` (+ `mapsToCategoryId` when true) — a hybrid
  design rather than two separate lists.
- **Transaction model gains two new optional fields**: `note?` (self-reported
  memo, data-only, engine never reads it) and `transferPurpose?` (pure
  metadata, same rule).
- **Suggestion hook** (`src/state/use-transfer-purpose-suggestion.ts`): always
  returns a pending suggestion, never mutates anything on its own. With `"ai"`
  consent scope, recipient + memo go through the existing `/api/agent/categorize`
  proxy with a new `mode:"transfer_purpose"` param to the server-side GreenNode
  LLM; without consent (or on any error) it degrades to a local, on-device
  heuristic (`src/ai/transfer-purpose/local-purpose-classifier.ts`). Every
  returned id is re-validated against the taxonomy before being surfaced —
  the model/heuristic output is never trusted blind.
- **UI**: `TransferPurposeSuggestionBanner.tsx` shows "Gợi ý mục đích … · chờ
  bạn xác nhận" with `[Đồng ý]` / `[Chọn khác]`, backed by a purpose picker
  sheet wired into `TransferCategorizeSection.tsx`.
- **Code review fixes** (score 6.5 → passing) before landing:
  - *Jar-balance inflation bug*: `spendFromJar` clamps a debit at 0 when the
    jar is underfunded, so the amount actually removed from the jar can be
    less than the requested amount. The refund path on "switch away" was
    blindly refunding the full nominal amount, which could push the jar
    balance above what was ever really debited. Fixed by tracking and
    refunding the exact clamped debit instead of the nominal one.
  - *Stale-purpose bug*: picking a plain spend category directly (bypassing
    the purpose picker) didn't clear a previously-accepted `transferPurpose`,
    leaving inconsistent metadata on the record. Fixed so a plain category
    pick clears any prior purpose.
  - Both got regression tests.

## Why

Transfer purpose and spend category answer different questions and must not
share a namespace — a `bill_split` transfer is metadata about *intent* even
though, once confirmed, it also happens to net out as a `dining` expense. Only
letting a **user's explicit accept** flip a hybrid purpose into `type:"expense"`
(never the AI suggestion itself) keeps invariant #6 (no silent mutation of
financial numbers) intact — the same non-committing pattern already used for
category suggestions, reused here rather than inventing a new consent/AI
pipeline. Reusing the `/api/agent/categorize` proxy with a `mode` discriminator
avoided standing up a parallel AI endpoint for what is structurally the same
classify-and-validate flow.

## Impact

- Users get a low-friction way to tag "why" behind a transfer, with hybrid
  purposes (rent/bill-split/paying-for-goods) able to correctly reclassify a
  transfer into real spending — but only after explicit confirmation, never
  automatically.
- Fixed a real (if narrow) financial-correctness bug: jar balances could have
  drifted upward on repeated category/purpose switching for underfunded jars.
- Verification: `tsc --noEmit` clean, 568/568 Vitest passing, lint 0 warnings/
  0 errors. Backlog item `PFM-146` (EPIC-03) added; `ARCHITECTURE.md` and
  `PRODUCT.md` updated to describe the new taxonomy and pipeline.

## Follow-ups

- Consent is still enforced client-side only (`localStorage` scope check) —
  not a real security boundary until server-side session/consent
  infrastructure exists.
- No persisted per-recipient purpose memory yet (unlike category suggestions,
  which have `category-memory.tsx`); every suggestion re-runs heuristic/AI
  from scratch. Worth revisiting once usage data shows repeat recipients are
  common.
