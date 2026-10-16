# 260908 — Spending Jars: Phase 01 (Jar model + engine + tests)

## What shipped
Phase 01 of `plans/260908-1311-spending-jars/` — the deterministic engine foundation for the spending-jars feature (envelope-style budget buckets). No UI yet.

- **`src/domain/engine/pressure.ts`** (new): extracted `NEAR_THRESHOLD`, `statusOf`, `daysLeftIn` out of `budget.ts` into a shared module; `budget.ts` now imports them. Behavior-preserving refactor (DRY, addresses red-team finding H3).
- **`src/domain/models/index.ts`**: added `Jar` / `JarConfig` / `JarAllocation` types (`version: 1`). Deliberately no color/icon fields — palette is a UI-layer concern, not domain data.
- **`src/domain/engine/jars.ts`** (new): `evaluateJars(config, txns, period, now, income) → JarLine[]`.
  - Spend math mirrors `netExpenseByCategory` exactly: transfers excluded, refunds reverse the category, per-category clamped to `Math.max(0, …)` (AD1) — no drift between jars and the existing expense engine.
  - `resolveIncomeBasis`: 2-tier priority — detected recurring salary (trailing-3-month tier cut, H7) → manual override number → `unknown`.
  - **Key invariant (Red Team C1):** when income is unknown, a jar line reports `allocated: null`, `pct: null`, `status: "unknown"` — but `used` still holds the real posted spend. Never coerces to a false "ok" (upholds architectural invariant #6, missing values stay unknown).
  - Implicit **"Chưa phân hũ"** (unassigned spend) line for categories not mapped to any jar.
  - Provenance folds worst-case across inputs (`lowestTrustSource` / `oldestFreshness`); income source is folded only into percent-based jars, not fixed-amount ones (invariant #5, H4).
- **`finance-compose.ts`**: threaded `ComposeOptions.jarConfig` through; `Financials` type gained `jarLines` + `jarIncomeBasis`. Jar config is treated as **user state** (passed like transactions), not provider `RawData` — it's not something an MSB adapter would ever supply.
- **Tests**: `jars.test.ts`, `pressure.test.ts`, plus 2 compose-level integration tests added to `finance-compose.test.ts` after code review flagged the missing seam. `src/insights/__tests__/helpers.ts`'s `makeFinancials` literal updated for the new fields (AD4).

## Decisions / deviations from plan
- Plan specified `freshness: string`; implemented as `string | null` on `JarLine.meta.freshness` and `IncomeBasis` instead — matches the codebase's existing `AggregateMeta` convention and avoids silently defaulting missing freshness to `""` (invariant #6).
- `resolveIncomeBasis` now filters the *correction-applied* transactions (same set `recurring` detection uses) rather than `raw.transactions` — fixed during review; the original was a latent, currently-harmless divergence between what income detection saw vs. what the rest of the engine sees.

## Code review outcome
`code-reviewer` agent: **8/10, 0 critical.**
- 2 warnings fixed before merge: missing compose-level jar integration test (added); income-basis transaction-source divergence (fixed, see above).
- 3 nits deferred to Phase 02: jar-config validation for category double-assignment across jars, an amount-cap of `0` reading as `"ok"` instead of a warning, and unassigned-category ordering in the "Chưa phân hũ" line.

## Gates
`vitest` 203/0 passing, `tsc --noEmit` clean. `npm run lint` remains broken repo-wide (pre-existing ESLint v9 config-migration gap, no `eslint.config.js`) — unrelated to this change, not a regression.

## Status
Work is **on disk, intentionally uncommitted** — user chose to leave it unstaged for now. Plan tracker updated: phase-01 marked complete, `plan.md` moved to in-progress, phase-02 annotated as unblocked. `docs/ARCHITECTURE.md` gained a "Spending jars (engine)" subsection describing the new module.

## Follow-ups
- Phase 02: jar-config validation (double-assigned categories, zero-cap semantics), unassigned-line ordering, then UI (jar cards, allocation editor).
- Commit the pending Phase 01 changeset when ready.
