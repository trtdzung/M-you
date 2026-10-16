# 260908 — Spending Jars: Phase 03–06 (Cashflow surfacing, setup UI, insight, surplus simulator)

Continuation of `260908-spending-jars-phase-01-engine.md` and `260908-spending-jars-phase-02-persistence.md`. This entry closes out the feature (`plans/260908-1311-spending-jars/`) through Level 3.

## What shipped

**Phase 03 — Cashflow "Hũ chi tiêu" section.**
Extracted a shared `PressureRow` primitive (`src/components/budget/`) so budgets and jars render identically — a red-team H3 finding, applied to keep the two pressure UIs DRY. `BudgetList` refactored onto it with no visual change. New `JarCard`/`JarList` render jar lines with per-category drill-down and provenance (source + freshness). Critically, a jar with an unknown income basis renders a NEUTRAL "chưa xác định thu nhập" card, never a green "ok" state (invariant C1 — never imply a computed result from unknown data). Off-current-month cards suppress days-left urgency (H2, an already-established rule from budgets). Wired into `CashflowView` as a `PiggyBank` `AccordionCard`. Review: 9/10.

**Phase 04 — `/pfm/jars` setup route.**
Full CRUD, category→jar assignment (one-category-one-jar), an allocation editor (percent or fixed VND, user-locked), an income-basis control, and a live allocation meter that warns on over-allocation but never blocks saving. Added a pure `validateJarInput` validator (M8) so NaN/negative/Infinity values can never reach the engine, plus a `uniqueJarId` guard on `addJar` (the gap explicitly deferred from Phase 02).

Review 7/10 surfaced two real UX/data bugs, both fixed before closing:
1. The %/VND toggle was reinterpreting the same stored number across units instead of converting it — switching units silently changed the allocation's meaning.
2. Switching to manual income basis auto-committed a fabricated ₫0 before the user typed a value, which would have persisted an invented number (violates "missing values stay unknown").

**Phase 05 — jar-pressure insight detector.**
New deterministic detector flags the single most-pressured jar (over → near), skipping unassigned jars and jars on an unknown income basis (C1) and returning null when not evaluating the current month (H2). Registered alongside the existing `budget_pressure` detector with **no cross-detector dedup in v1** — a deliberate decision (M10/AD2/F3): severity ranking already orders both insights sensibly, and dedup logic was judged unnecessary complexity for a first pass. Review: 9/10.

**Phase 06 — Level 3 surplus simulator.**
New pure engine module `surplus.ts`:
- `computeSurplus` (M12 formula) — unknown income basis yields surplus `"unknown"`, never `0₫` (Security-F6: never fabricate a numeric result from missing input); a real deficit floors at 0 rather than going negative.
- `simulateSurplusAllocation` — caps each goal at its own headroom and at whatever surplus remains unallocated, sanitises input, performs no mutation.

`SurplusPanel` UI is a strictly **read-only what-if** — no money movement, no draft produced, consistent with architectural invariants #2 and #3 (AI/UI never commits or executes). Review 9/10, with a loading-state gap and incorrect breakeven-month copy fixed before closing.

## Outcome
- 246/246 tests passing; `npx tsc --noEmit` clean.
- All engine additions (`surplus.ts`, jar-pressure detector) are pure functions with fixture-based tests — no engine code depends on the LLM or UI state.
- Feature spans Level 1 (cashflow surfacing) through Level 3 (surplus simulation) and is functionally complete.

## Status
Work is **on disk, not yet committed**. The working tree also carries unrelated, in-progress "overview-cockpit" changes (see `260908-pfm-overview-cockpit.md`); commit scoping between the two efforts is pending a user decision.

## Follow-ups
- Decide commit scoping: spending-jars vs. overview-cockpit changes currently interleaved in the same working tree.
- Cross-detector dedup between `jar_pressure` and `budget_pressure` deferred to a later pass if user feedback shows duplicate/confusing insights.
- `npm run lint` remains broken repo-wide (pre-existing ESLint v9 config-migration gap, unrelated to this feature).
