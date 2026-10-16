# 2026-09-17 — Hũ "một con số": unify phân bổ + hạn mức into `budgetLimit`

## What changed

Collapsed two previously-conflated per-jar concepts — tiền phân bổ (allocation) and
hạn mức (spending limit) — into **one field, `budgetLimit`**: allocation = spending
ceiling = starting balance. Delivered across 6 phases per
`plans/260917-jar-envelope-single-number/plan.md` (source: `brainstorm-summary.md`,
red-team session with 14 findings, all accepted: 3 critical, 3 high, 8 medium).

- **Engine.** Rewrote `src/domain/engine/jar-envelope.ts` (`casaPool`,
  `jarEnvelopeLines`, `evaluateJarEnvelope`): allocated = Σ(`budgetLimit ?? 0`),
  pending = `max(0, CASA pool − allocated)`, remaining = `budgetLimit − đã tiêu`;
  unset stays `null` per invariant #6, never coerced to 0. `allocation-plan.ts`
  reduced to just the `fitsCasaCap` validator — the old `jar-cap.ts` module and a
  YAGNI `remainingToAllocate` helper were dropped (M4).
- **Server-side hard cap (red-team C2).** Σ `budgetLimit` ≤ CASA is now enforced on
  *both* write doors — batch `PATCH /api/jars` and single `PATCH /api/jars/:id` —
  with CASA derived deterministically server-side from persona `salaryBase`
  (`src/lib/casa-pool.ts`, 18tr × salaryBase/25tr). Over-cap returns 422 + `overBy`.
  Client-side checks (`useCasaPool`, `HuEditorSheet`, `AllocationSheet`) are UX-only
  — the server is the real gate.
- **H3 resync rule** (`src/domain/jar-rules.ts`, `resyncActualOnRaise`):
  `actualAmount` (the distinct Chuyển-tiền spendable balance) re-syncs **up** only
  when `budgetLimit` is raised on an undrawn jar — never on a decrease, and the
  transfer-from-jar flow otherwise stays untouched (explicit out-of-scope in plan).
- **Atomic batch writes.** `updateJars(patches)` in `src/state/jars.tsx` + provider,
  one transaction / one `setConfig` (fixes H1's `Promise.all` race), with
  `undefined → null` wire encoding for "clear to chưa đặt."
- **Seed fix.** Per-persona scaling in `scripts/seed-db.mjs`
  (`SALARY_BASE_BY_CIF`: CIF_0001=25tr, CIF_0002=22tr, CIF_0003=80tr) — fixed
  CIF_0002's prior over-allocation bug (red-team C3). Committed `data/pfm.sqlite3`
  now has Σ `budgetLimit` ≤ CASA for every persona.
- **Retired the `JarAllocation` ledger entirely**: interface, `jar_allocations`
  table (`DROP TABLE IF EXISTS` migration added in `src/lib/db.ts`, irreversible —
  acceptable since it's mock data, M8), `/api/jar-allocations` route,
  `jar-allocations-store.ts`, `state/jar-allocations.tsx` /
  `JarAllocationsProvider`, and the `getJarAllocations`/`allocateBalance` provider
  methods.
- **UI.** `AllocationSheet` ("Chia ngay") changed from an additive top-up into a
  "số tổng mới" per-jar limit editor — prefills each jar's current limit, only
  patches changed jars so editing one jar never wipes another (red-team C1;
  regression-tested).
- **Tests.** Rewrote jar-envelope/allocation-plan suites; added AllocationSheet,
  jar-rules-resync, and seed-fits-casa (reads the committed sqlite) tests; added a
  new route-level integration suite `src/app/api/jars/__tests__/route.test.ts` (8
  tests, real handlers over in-memory SQLite, covering the 422 cap path + H3 +
  404/422 on both write doors).

## Why

The old model let "how much I set aside" and "how much I'm allowed to spend" drift
independently per jar (`funded` vs `budgetLimit`), which was the direct cause of the
CASA over-allocation bug for CIF_0002 and made the "Chia ngay" additive-write UX
ambiguous (finding C1: did tapping "Chia" top up or overwrite?). Red-teaming this
plan surfaced that the real fix wasn't a smarter reconciliation between two numbers
but eliminating the second number: `budgetLimit` alone can serve as allocation,
ceiling, and starting balance because the engine derives everything else
deterministically (invariant #1). Kept the cap check server-side, not just client
UX, because client-only validation doesn't survive a direct API call (C2). Scoped
out merging `jar-budget.ts` and `jar-envelope.ts` (two engines reading the same
`jar.budgetLimit`, M7) and touching `SEED_BUDGETS`/`budgetLines` (confirmed dead
code, not desync, M6) — both explicitly deferred rather than pulled into this pass.

## Impact

- `tsc --noEmit`: 0 errors. `vitest run`: 558 passing / 0 failing. `next lint`: 0
  errors / 0 warnings.
- Code review: 9/10, 0 critical findings.
- Transfer-from-jar flow (`TransferAmountStep` / `TransferCompose` /
  `TransferCategorizeSection` / `backfillActualAmount`) untouched by design, except
  the single H3 resync exception.
- `data/jar-allocations/schema.md` deleted; `data/jars/schema.md`,
  `data/schema.sql`, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md` updated to reflect
  the single-number model.

## Follow-ups

- Plan phase 05 (docs + test/lint gate) is the last phase, marked in-progress at
  time of writing — confirm it's closed out before archiving the plan.
- Future, explicitly out-of-scope work: merging `jar-budget.ts` (Ngân sách) and
  `jar-envelope.ts` (Overview) into one engine now that both read the same
  `budgetLimit` field (M7).

---

**Status:** DONE
**Summary:** Logged the "hũ một con số" refactor to
`docs/journals/260917-jar-single-number.md` — unifying jar allocation/limit into
`budgetLimit`, server-side CASA cap enforcement on both write doors, H3 actualAmount
resync rule, atomic batch writes, per-persona seed fix, full `JarAllocation` ledger
retirement, AllocationSheet UX change, and new route-integration tests (558/558
tests, 0 lint errors, 9/10 review).
**Concerns/Blockers:** None — phase 05 (docs/gate) was in-progress per the plan
file at the time of this entry; worth a quick follow-up check that it's marked
done.
