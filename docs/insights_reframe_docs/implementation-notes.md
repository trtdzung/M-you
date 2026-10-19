# Implementation notes (maintained by the coding agent)

> Do not mark a phase complete before inspecting the diff and running its tests. Record exact commands and outcomes; do not report assumed success.

## Baseline audit

- [x] Confirmed active Home widget → route → service → snapshot path: `HomeInsightWidget.tsx` -> `POST /api/proactive-insights/current` -> `src/app/api/proactive-insights/current/route.ts` -> `src/lib/home-insight-service.ts::generateHomeInsight()` -> `src/lib/financial-snapshot-service.ts::customerSnapshot()` -> `src/insights/proactive/snapshot.ts::buildCustomerSnapshot()`.
- [x] Confirmed references/call sites for `src/lib/proactive-insights-service.ts`: unconnected alternate pipeline (`currentHomeInsight`, `trackHomeInsight`), uncalled by active UI/routes.
- [x] Reviewed existing engine, detector, Home service, route and UI tests.
- Baseline test command/outcome: `npx vitest run src/insights/proactive/snapshot.test.ts src/insights/proactive/core.test.ts src/insights/proactive/store.test.ts src/insights/proactive/copy-contract.test.ts src/lib/__tests__/home-insight-service.test.ts src/app/api/proactive-insights/current/route.test.ts src/insights/__tests__/detectors.test.ts src/insights/__tests__/jar-pressure.test.ts` (8 files, 53 tests passed).
- Findings:
  1. Live Home endpoint and widget contract expects `HomeInsightResult` with `candidate` matching `SnapshotCandidate` shape.
  2. Health engine (`src/domain/engine/health.ts`) only has `runwayMonths` and `concentration`; 0-100 Financial Health Index with 4 pillars does not yet exist.
  3. Candidate generation in `snapshot.ts` currently handles minimum payment reminders, jar pressure/burn, spending spikes, and surplus/pool allocation.
  4. Rules needing deposit maturity, card statement history, 90d balance time series, credit bureau data, or insurance absence must remain blocked/null per `06_OPEN_DECISIONS.md`.

## Phase status

| Phase | Status | Evidence / tests |
|---|---|---|
| 0 — Characterize current behavior | Completed | 8 vitest test suites, 53 tests passing. Baseline audit recorded. |
| 1 — Contracts and score policy | Completed | Added `src/domain/models/health-score.ts`, re-exported in `src/domain/models/index.ts`. Versioned `HEALTH_SCORE_POLICY_V0`. |
| 2 — Pure Financial Health Score | Completed | Implemented pure `src/domain/engine/health-score.ts`, re-exported in `src/domain/engine/index.ts`. Added 30 unit tests in `src/domain/engine/__tests__/health-score.test.ts` (all passing). |
| 3 — Jar-pressure vertical slice | Completed | Enriched jar candidates in `snapshot.ts` with semantic states (`needs_cover`, `over_limit_covered`, `near_limit`, `burn_risk`), rule_id, positive display metrics (`amount_needed` / `amount_remaining`), and verified against active Home route contract. Tests in `snapshot.test.ts`. |
| 4 — Additional data-supported rules | Completed | Activated `known_payment_due_reminder`, `spending_spike`, and implemented `refund_received` in `snapshot.ts`. Kept missing-data rules (`deposit_maturity`, `idle_cash_90d`, `cash_liquidity_risk`) BLOCKED. Synchronized `proactive-rule-registry.json` and `03_RULE_REGISTRY.md`. |
| 5 — Dispatcher/lifecycle unification | Completed | Preserved single active dispatcher pipeline: `HomeInsightWidget` -> `POST /api/proactive-insights/current` -> `home-insight-service.ts` backed by `home_insight_cache`. Avoided 3rd pipeline. Integrated `healthScore` into `CustomerFinancialSnapshot`. |
| 6 — API/UI/narrative integration & Documentation | Completed | Updated `docs/DATA-READINESS.md` §6 with full Bảng 2 & Bảng 3 readiness matrix; updated `docs/ARCHITECTURE.md` to document Financial Health Score engine and Proactive Insights reframe. |
| 7 — Test verification and handoff | Completed | Targeted Vitest suite covering 9 test files, 74 tests passing. Verification of TypeScript compilation, package constraints, and diff hygiene. |

## Known source limitations

See `01_REPO_AUDIT.md` and `06_OPEN_DECISIONS.md`. Do not remove entries until code/data-source evidence demonstrates they are resolved.
