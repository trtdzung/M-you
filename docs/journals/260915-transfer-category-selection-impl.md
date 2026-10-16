# Transfer category selection — implementation

**Date:** 2026-09-15
**Plan:** `plans/260915-1705-transfer-category-selection/` (all 5 phases done)

## What shipped

On the mock "Chuyển tiền thành công" screen, a transfer now **always** records exactly one `self_reported` transaction and lets the user *optionally* categorize it. Jar-sourced transfers default to the source jar's first (expense) category; account-sourced transfers default to `Chuyển khoản` (`type:"transfer"`, excluded from spend by the engine). Categorizing is opt-in and never blocks the completed transfer.

## Key changes

- **`src/state/manual-txns.tsx`** — `ManualTxnInput.type?` override; `add` returns the new id; new `update(id, patch)` returning a found-boolean; storage scoped per persona (`msb-pfm.manual-txns.<cif>`) with reset-then-reload on persona switch. A `txnsRef` mirror makes `add`/`update` return values reliable despite `setState` batching.
- **`src/lib/category-txn-type.ts`** (new) — `typeForCategory` derives txn `type` from the category's kind so `categoryId`/`type` can never drift (0-category jar → `type:"transfer"`, no phantom expense).
- **`src/lib/transfer-draft-store.ts`** — `deleteTransferDraft` + `isTransferDraftUsed` (a `msb-pfm.used-draft.<id>` marker) so a reload/replay shows "đã hoàn tất", never an editable form.
- **`src/components/transactions/CategoryPickerSheet.tsx`** — `allowedCategoryIds` (jar restriction) + `uncategorizedOption` ("Không phân loại") props; jar-empty state; old call-sites unchanged.
- **`src/app/transfer-confirm/TransferConfirm.tsx`** — rewrote `confirm()`: always-create, `committedRef` double-tap latch, draft consumption, async-first ordering + try/catch that releases the latch on failure (retryable).
- **`src/components/transfer/TransferCategorizeSection.tsx`** (new) — extracted the categorize card + picker + jar debit/refund (`spendFromJar`) logic; seeds `appliedJarId` from the jar `confirm()` already debited.

## Decisions / tradeoffs

- **F#5 "trừ luôn hũ":** re-categorizing an account-sourced transfer into a jar-owned expense debits that jar's Thực tế (and refunds on change) but does **not** debit the account balance, so the two can diverge. Intentional prototype tradeoff, documented in `docs/ARCHITECTURE.md`.
- **F#3 double-tap:** strengthened the plan's `useState` guard to a `useRef` latch — a synchronous double-tap reads stale state, so the ref is what actually prevents a second txn.
- Detail-screen category edits (via `useCorrections`) work for these records but don't re-run jar sync — noted as out of scope.

## Verification

- `tsc --noEmit` clean; 22 new/adjusted tests green (engine exclusion, store add/update/persona-isolation, component: jar/account picker, 0-category, double-submit, reload-replay, update-error, provider-failure retry).
- Code review: initial 7.5/10 → all 3 warnings + 1 nit addressed (retry lock, `appliedJarId` coupling, file-size via extraction, scoped empty-state guard).
- Full-suite `PFM hub` smoke timeout is pre-existing environmental contention (passes in isolation), unrelated to this change.
