# 2026-09-17 — Remove income, re-base jar envelope onto CASA balance

## What changed

Removed the concept of "income" (thu nhập) from the engine/model/UI entirely — the app
now tracks **spending only**. Net worth (accounts/assets/liabilities/snapshots) was
explicitly **kept**. Delivered across 5 phases per
`plans/260917-1413-expense-only-remove-income/plan.md`.

- **Model/engine.** `TransactionType` and `CategoryKind` dropped `"income"`.
  `CashflowResult` dropped `income`/`net` (expense-only now). `FinancialHealth` dropped
  `surplus`/`essentialCoverage`, keeping just `runwayMonths`/`concentration`. Projection
  dropped the `expectedIncome` term and the `recurring` param. `category.ts` dropped
  `incomeByCategory` (its test file was deleted outright — the field no longer exists).
  `cashflow-trend` point shrank to `{month, expense, hasData}`.
- **Envelope re-base — the central design decision.** The jar/hũ feature was not deleted;
  its funding source changed. Pool = Σ `availableBalance` of `type:"current"` accounts —
  `unknown` (not 0) when there are no current accounts, per invariant #6. `pending.amount
  = max(0, pool − Σ allocations)`. Per jar: `funded` = Σ allocations into that jar;
  `budgetLimit` is now a **separate** overspend-warning ceiling, not the funding amount;
  `remaining = funded − spent`. Still virtual bookkeeping — `source: self_reported`, no
  real money movement (invariant #3, no OTP/credentials touched).
  `JarAllocation` dropped `txnId` (no longer tied to an income transaction).
  Provider method renamed `allocateIncome` → `allocateBalance`. The old coherence
  identity ("pending + Σ funded === period income") is replaced by "allocations partition
  the current-account balance."
- **Persistence.** `src/lib/db.ts` gained a self-healing migration: detects the legacy
  `txn_id` column via `PRAGMA table_info` and drops `jar_allocations` before re-exec.
  Idempotent, safe on fresh installs, no manual migration step needed.
- **Insights/AI.** `src/insights/detectors/income-change.ts` deleted; the monthly brief no
  longer emits a "Dòng tiền dương" (positive cash flow) insight. The AI categorize catalog
  is expense-only now (prompt + service + route updated).
- **Dead code removed.** `CashflowChartView.tsx` and `CashflowTrendChart.tsx` (and their
  tests) deleted — superseded, unused after the cashflow-result shape change.
- **Docs.** `PRODUCT.md`, `ARCHITECTURE.md`, `plans/project-backlog.md` updated;
  `PFM-144` retitled "Hũ CASA-balance ledger"; `PFM-043`/`PFM-052` dropped
  debt-to-income/surplus/essential-coverage language.

## Why

Scope was clarified with the user across three rounds, in this order: (1) remove income
fully from the engine — it was adding complexity without a real MSB income-verification
story; (2) explicitly keep net worth — that module is income-independent and still
valuable; (3) the envelope/jar feature must be **re-based, not deleted** — allocation
still means something once you combine "set aside part of the CASA balance" with "set a
spending limit" for a jar, it's a UI display change that moves no real money and doesn't
require an income concept at all.

Kept `budgetLimit` as a distinct field from `funded` deliberately: collapsing them would
have lost the "warn me if I overspend this jar" semantics that predates income-removal —
splitting funding (what's earmarked) from limit (what's acceptable to spend) is more
correct than either the old income-ledger model or a naive "funded IS the limit" merge.

## Impact

- `tsc --noEmit`: 0 errors. `vitest run`: 550 pass / 0 fail. 21 test files updated, 1
  deleted (`category.test.ts`).
- Code review: 9/10, no critical findings; one dead-code branch in
  `CategoryManager.tsx` cleaned up post-review.
- Untouched by design (income-free already): `networth.ts`, `jar-budget.ts`,
  `category-jars.ts`, `goals.ts`, `surplus.ts`, `obligations.ts`, `recurring.ts`,
  `debt.ts`, all wealth components, and the transfer (Chuyển tiền) flow.
- Two nits kept intentionally rather than "fixed": `limit`/`overLimit` naming reads as a
  forward-looking "set a limit" concept (has test coverage as-is); a default `refund` on
  manual credit transactions is latent/unreachable code, not worth chasing down in this
  pass.

## Follow-ups

- None blocking — plan marked Done. If a real MSB CASA balance feed ever lands, the pool
  calculation in `jar-envelope.ts` is the single seam to swap from mock `availableBalance`
  to a live provider value.

---

**Status:** DONE
**Summary:** Logged the income-removal + jar-envelope CASA re-base session to
`docs/journals/260917-expense-only-remove-income.md` (model/engine cuts, the CASA-pool
re-base decision, persistence self-heal migration, insights/AI cleanup, dead-code
deletion, docs/backlog updates, 550/550 tests, 9/10 review).
**Concerns/Blockers:** None.
