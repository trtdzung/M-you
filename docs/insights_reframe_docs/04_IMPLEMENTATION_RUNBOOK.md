# 04 — Implementation runbook (ordered phases)

## Global rule

Do not implement all concepts in a single unreviewed rewrite. Finish one phase, run its gates, and keep the app buildable. The existing Home widget and API must remain functional between phases.

## Phase 0 — Characterize current behavior (mandatory, no broad refactor)

1. Read `GEMINI.md`, this docs folder, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA-READINESS.md`, `docs/insights/proactive_insight_llm_contract.md`, and the relevant route/widget/service files.
2. Run the source-map commands in `01_REPO_AUDIT.md` and confirm the two pipeline paths.
3. Inspect test coverage for `snapshot.ts`, `home-insight-service.ts`, `current/route.ts`, `proactive/core.ts`, `proactive/store.ts`, `health.ts`, and `finance-compose.ts`.
4. Add characterization tests for existing response shape / top-priority behavior if a required scenario is uncovered.
5. Produce a short code-level gap list in `docs/insights_reframe_docs/implementation-notes.md`. Do not stop at a plan if implementation can safely begin; this note is audit evidence, not a deliverable that substitutes for code.

**Gate:** baseline behavior is captured, current route is confirmed, no second endpoint/pipeline has been introduced.

## Phase 1 — Contracts and score policy

1. Search for existing contracts before adding types. Prefer `src/domain/models/index.ts` for canonical shared model types or a focused sibling file only where it prevents circular imports; re-export through existing index if necessary.
2. Implement a focused policy/types contract for the 8 metric health index from `02_TARGET_CONTRACTS.md`. Keep the policy version and thresholds in one constant.
3. Use clear names distinguishing raw value, normalized score, source, period/as-of, and availability reason.
4. Avoid changing Home API response or UI yet.

**Gate:** TypeScript compiles; types do not duplicate `Insight`/`ProactiveCandidate` needlessly; thresholds are named constants and documented.

## Phase 2 — Pure Financial Health Score (Bảng 2)

1. Add a pure scoring module, suggested path `src/domain/engine/health-score.ts`, plus exports from `src/domain/engine/index.ts` if consistent with current convention.
2. First implement score mapping from explicit metric facts; then implement aggregation. Do not couple the scorer to React, Providers, SQLite, network, localStorage, or LLM.
3. Do not pretend every input is currently available. The composer should return `null` plus a reason where inputs cannot be sourced reliably.
4. For facts derivable from current code, reuse existing functions/outputs: `financialHealth`, `cashRunwayMonths`, `Financials.cashflow`, `Financials.prevCashflow`, net-worth and goal facts where provenance is adequate. For a 3-month metric, compute a real 3-month window from eligible posted transactions; do not approximate by duplicating a one-month aggregate.
5. Do not call absence of liabilities/insurance/credit history evidence of good or bad health. If the user has not affirmatively confirmed an empty liability profile, debt service is unknown.
6. Decide separately whether the score should be composed into `Financials`; do not cause client and server to report different health scores. If you expose it in `Financials`, update all dependency paths and tests, not only the client hook.

**Gate:** unit tests cover every mapping boundary, `null`, zero denominators, non-finite input, negative/invalid values, weight/coverage math, all-missing inputs, 2/3/4 available pillars, 4/5 available metrics, stable output under same input, and source preservation.

## Phase 3 — Complete one vertical slice in Bảng 3

Use the existing jar-pressure rule as the first end-to-end slice because its required financial facts already exist.

1. Keep financial calculations in `computeFinancials` and `jar-budget.ts`/related pure helpers.
2. Keep the rule in `src/insights` (`src/insights/detectors/jar-pressure.ts` and/or the proactive candidate layer, as appropriate). Do not create a new domain-engine insight module.
3. Emit one validated candidate with stable ID, rule/version, category/semantic state, source/freshness, metrics/evidence and only an existing permitted action.
4. Preserve the distinctions: limit versus running balance; a negative jar balance versus over-limit but still positive balance; unknown limit versus zero limit; current month versus prior month; a covered rebalance versus residual shortfall.
5. Integrate into the active Home route only after adding contract-level tests. Keep the Home widget's `HomeInsightResult` contract intact, or update producer, route, consumer, and all relevant tests in one migration.

**Gate:** candidate trigger/no-trigger/boundary tests pass; the same insight does not appear twice from two detectors; no fabricated financial facts; Home widget's loading/error/empty/success/dismiss flows stay tested.

## Phase 4 — Add rule families using the registry

Implement only rules whose required data can be sourced. Recommended order:

1. Spending spike: preserve or improve comparable-window behavior and document thresholds.
2. Recurring summary/change: distinguish summary from a truly new recurring transaction or price increase.
3. Known minimum-payment reminder: use exact minimum-payment semantics and valid VN dates.
4. Refund event: only after verifying posted status, source transaction relation, budget impact and dedupe.
5. Income-allocation suggestion: requires new-income event and safety buffer, not just a large current CASA.
6. Deposit maturity, true cashflow shortfall, 90-day idle cash, and goal schedule claims stay disabled until the required source fields/history exist.

**Gate:** each rule has input facts, rule version, trigger, suppression, resolve condition, test cases, and source/data-readiness note in both human and JSON registries.

## Phase 5 — Dispatcher and lifecycle unification

1. Reuse the stable ranking semantics from `src/insights/proactive/core.ts` and persistence semantics from `src/insights/proactive/store.ts` where feasible; do not build another independent dispatcher.
2. Before persistence migration, explicitly decide if the current active `home_insight_cache` path is to be replaced by the versioned `proactive_insights`/events path. These are not interchangeable caches; the current Home endpoint uses the former.
3. If migrating, add compatibility tests for the current route/widget payload, write an additive SQLite schema change, handle stale/expired/dismissed state and idempotent events, and ensure one active version per customer/rule/entity.
4. Add offer quotas only when events distinguish offer display from operational insight display. Do not count refund/payment notices as offers.
5. Ensure a trigger naturally resolves only when no longer true or the source event is completed. Dismissal alone is not resolution.

**Gate:** duplicate API calls return stable DTOs; stale event IDs cannot dismiss newer cards; repeated calls do not create unbounded versions; cache invalidation responds to material input changes; the database migration does not require `db:seed`.

## Phase 6 — API/UI integration and narrative

1. Keep the UI simple and consistent with current components. First render the high-level score only if it passes the score-display gate; otherwise render the insufficient-data state with clear reasons.
2. Keep the Home primary card compatible. If adding a score page/section, use an existing surface and design system, not a new app navigation overhaul.
3. Keep numbers in structured fields. Templates are the default. The LLM may paraphrase eligible facts but must not choose eligibility/priority/action or invent data.
4. Validate all model output with existing `src/insights/proactive/copy-contract.ts` or extend it with tests; do not bypass its guard.
5. Add loading, error, empty, stale, low-coverage and model-failure states. A failed AI call must not suppress a valid deterministic result.

**Gate:** Home flow and existing PFM screens pass tests, build succeeds, and user actions are navigation/review drafts only.

## Phase 7 — Documentation and handoff

Update `docs/ARCHITECTURE.md`, `docs/DATA-READINESS.md`, this pack, and `implementation-notes.md` only after code state changes. Include actual routes/DTO/schema and mark blocked rules honestly. Remove or label any superseded instructions that would cause a coding agent to implement the obsolete path.

## Out of scope unless separately approved

- Production authentication/real bank APIs.
- Any automatic payment, transfer, term-deposit rollover, or product purchase.
- Direct calls to a Gemini model from the PFM runtime (Gemini is the coding agent, not a requirement for a runtime LLM integration).
- New product rates/promises, credit bureau integrations, daily CASA history fabrication, major visual redesign, unrelated cleanup.
