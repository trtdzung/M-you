# 260909 — Hũ (Spending Jars): Balance-Lens Redesign (Model A)

All 5 phases of `plans/260909-1352-hu-balance-lens-redesign/` implemented in one session — a full rewrite of the spending-jars feature shipped on 260908.

## Why the rewrite

The 260908 feature modeled jars as monthly spending envelopes: allocation = % of income, "used" = period spend vs allocation, pressure = used/allocation. That model needed an income basis, an anchor date, and a clock to define "this period" — and red-teaming during that phase kept surfacing a class of anchor/clock bugs against the static mock (frozen `DEMO_NOW`, static `account.balance`) that don't actually exist in the new model, because the new model needs none of those inputs. It also required a separate "Ngân sách" concept living alongside jars, which was redundant.

**Model A** replaces this with a display-only **snapshot partition of the current primary-account balance**: jars are how much of *today's balance* is earmarked for what, not how much of *this month's income* has been budgeted. No anchor, no clock, no income basis — the whole bug class is structurally eliminated rather than patched.

## What changed

**Engine (`src/domain/engine/jars.ts`, rewritten).**
`evaluateJarPartition` yields explicit jar earmarks plus a "Chưa phân bổ" (unallocated) residual such that `Σ(earmarks) ≡ primaryBalance` exactly, by construction — the residual absorbs the whole-VND rounding remainder so the partition never drifts from the real balance. `resolvePrimaryAccount` / `resolvePrimaryBalance` return `unknown` (never a silent `0`) when there are 0 or 2+ accounts of `type:"current"`. `resolveAllocation` supports percent (% of balance) or fixed VND. A dev-only `assertPartitionBalances` invariant check is wired into `finance-compose` to catch any future drift at compose time.

**Budgeting merge.** Hũ is now the single budgeting concept — no separate "Ngân sách" surface. A jar's `chia` (allocation) doubles as its monthly spending reference, so "đã tiêu kỳ này" (an informational overlay computed via `netExpenseByCategory` over the jar's categories, plus prior month for MoM) exceeding `chia` is a non-blocking over-budget warning. Similarly, `Σchia > balance` (residual < 0) is a non-blocking over-allocated warning. Neither state alters the earmark or breaks the balance identity — the overlay is strictly informational. Legacy flat `Budget`/`budget.ts` left dormant, not deleted (YAGNI — no callers left, no need to force a delete this pass).

**Surplus (L3 what-if).** `surplusFromResidual` now treats the residual as a stock: `max(0, residual)`. Fixes a red-teamed double-subtract bug in the prior model (surplus had been computed as income − expense a second time, on top of the allocation math already subtracting it).

**Config v2.** Dropped `incomeBasis` from the schema; stored v1 configs are discarded and reseeded via `migrateJarConfig` rather than migrated in place (no v1 users existed outside dev). Three pickable seed templates — Cá nhân 6, Gia đình 4, Kinh doanh 3 — each allocating ≤100%. Provider storage guard `isValidJarConfig` updated for v2 and hardened (from code review) to reject `NaN`/`Infinity`/negative/`>100%` allocation values at the storage boundary, not just at the UI validator.

**UI.** `JarCard`, `AllocationMeter`, `JarList`, `JarSetup`, `SurplusPanel`, `CashflowView` reworked for the balance-partition framing; `IncomeBasisControl` deleted (no longer a concept). Added a trust line so the balance identity (jars sum to account balance) is visible, not just internally asserted.

## Outcome
- `tsc --noEmit` clean.
- 259/259 tests passing — jar suites rewritten with non-tautological per-jar assertions (prior suites asserted structure without independently computing expected earmarks; new ones do).
- `next lint` and `next build` both clean (0 errors/warnings).
- Code review: 8/10, 0 critical. All flagged concerns addressed before closing: `docs/ARCHITECTURE.md` and `docs/PRODUCT.md` synced to Model A, storage-boundary guard hardened, `assertPartitionBalances` wired into compose, one stale comment referencing the old income-basis model fixed.

## Status
Work is **on disk, not yet committed** (working tree shows the full jars/budgeting-merge diff as modified/deleted files, plus doc updates).

## Follow-ups
- Decide whether to delete dormant `Budget`/`budget.ts` now that Hũ fully subsumes budgeting, or keep it dormant pending confirmation nothing else references it.
- Commit scoping/timing for this changeset is a user decision.
