## 2026-09-19 — Hũ không-thể-âm + auto-rebalance (plan `260918-1120-unify-jar-spendable-derived`)

### What changed
Jars ("hũ") can no longer end a flow over-budget unfunded. Shipped in 3 commits on `main` (not pushed):
- `4a98159` feat(jars): enforce not-negative jars via role-based auto-rebalance — engine/domain/API/insights
- `38372f5` feat(jars): surface auto-rebalance in transfer and budget UI
- `7cc10e8` docs(jars): document rebalance-as-transaction model and role column

Core mechanics:
- New remaining formula: `remaining(hũ) = budgetLimit − đã_tiêu(real category) + Σ nhận_điều_chỉnh − Σ cho_điều_chỉnh`.
- Inter-jar coverage is a **rebalance-as-Transaction**: one `Transaction` tagged `categoryId: "dieu-chinh-hu"` (internal, excluded from thu/chi) carrying `meta {fromJarId, toJarId, triggerTxnId, origin: "auto"|"manual"}`, persisted through the existing manual-txns store/API — no new ledger table.
- New `Jar.role` (`buffer`/`spending`/`essential`/`goal`) drives a donor waterfall: pool "Chưa phân bổ" → buffer → spending → essential → goal. `goal` is protected — never auto-raided; a goal-only remainder sets `requiresManualGoal` and requires explicit human confirm.
- Case 1 (pay from a short jar) and Case 2 (spend posted, categorized later) share one `useAutoFund` hook + pure `auto-fund-core.ts`.
- Over-allocated residual state ("Vượt phân bổ" pool banner + durable per-jar "cần bù thủ công") is surfaced explicitly, never silently zeroed.
- New `jar_overspend_covered` insight detector; role editor added to `HuEditorSheet`/`HuCategoryTab`; `AutoFundResultBanner` and `JarRebalanceLines` added to transfer/budget UI.

### Why / decisions
- **Rebalance-as-Transaction replaces two earlier ideas, both overturned:** "spread-as-spend" (charging a donor's `take` into the donor's real category — rejected because it inflates spend-by-category for the exact envelope being protected) and a dedicated `JarRebalance` ledger table (rejected as redundant — a tagged `Transaction` rides the existing persistence and is already excluded from thu/chi).
- **True pool identity corrected pre-implementation:** `pool + Σ spendable = CASA` (tautological), not `pool + Σ remaining` (false once any jar is over-budget) — a design bug caught before coding, not in production.
- **4-lens red team before coding** (5 Critical, 6 High, 3 Minor, 7 Scope findings; see plan's Red Team Review table) caught two real math/ordering bugs in the *approved* design: C1 (pool-identity misstatement) and C2 (one-sided goal exclusion in the donor tier ceiling, which under-covered shortfalls by the goal amount). Both fixed in the plan before Phase 01 started.
- Scope-cut proposals (collapse the 4 roles, drop role editor/"Đổi nguồn"/insight detector) were all rejected — full feature scope kept.

### Impact / verification
- Phase 07 testing surfaced a **real production bug**, not papered over: `fundJar()` in `src/state/use-auto-fund.ts` had an `insufficient`-tier guard that fired even after an explicit `includeGoal:true` confirm, making `commit()` unreachable for a confirmed goal-jar raid (Case 2 "Xác nhận rút" silently failed). Fixed by AND-gating with `!assessment.requiresManualGoal`. This took the suite from partial-red to **706/706 green**, `tsc --noEmit` clean.
- `code-reviewer` scored 8.5/10, 0 critical. Its one warning — `commit()`'s try/catch rollback is dead code because `add()` fires `apiCreate` as a background `.catch(log)`, so async persist failures never reach the compensating `remove()` — was resolved by correcting the overclaiming comment rather than a deep atomicity refactor (out of scope for the SQLite prototype). 2 nits (mid-file import, undo-button latch) also fixed.
- `docs/ARCHITECTURE.md`, `data/schema.md`, `data/jars/schema.md`, `data/schema.sql` updated to the new model.

### Follow-ups
- H2 (two overspends racing the same donor) deferred to pilot — accepted as single-user-prototype risk, mitigated only by a cheap reconciliation read-check.
- The `commit()` rollback-is-dead-code gap (background `apiCreate` failures not compensated) is a known limitation of the SQLite-prototype persistence model, not fixed this session.
- Threshold re-confirm for large auto-fills noted as P2/default-OFF, not built.
- 3 commits are on `main` locally but not yet pushed.
