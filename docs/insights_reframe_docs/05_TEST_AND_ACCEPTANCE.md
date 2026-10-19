# 05 — Test strategy, acceptance criteria, and release gates

## 1. Test commands

The repository defines:

```bash
npm test
npm run build
npm run lint
```

Run targeted Vitest files before the full suite. If dependencies are not installed, use `npm ci` in the developer checkout first; do not add `node_modules` to the source archive. If a repo script fails because the toolchain/script is incompatible, report the exact failure rather than changing configuration outside scope.

## 2. Financial health scoring tests

Create tests near `src/domain/engine/__tests__/health-score.test.ts` (or the project's chosen consistent location).

Required cases:

- Exact score at every threshold and immediately below/above it for spend-to-income, runway, savings rate and debt service ratio.
- Ratios of 0, 0.7, 1.0, 1.3; negative, NaN, Infinity and unsafe numeric input rejected or unavailable according to contract.
- Zero/no income, fewer than two income months, missing history, unknown essential-spend basis, and no known obligations all preserve unknown semantics where appropriate.
- Missing liability profile is not the same as affirmatively confirmed no liabilities.
- Missing insurance data is not false; a confirmed `false` is score 0, not `null`.
- No goal or invalid goal target gives null component; valid goal completion yields a bounded 0..100 score.
- Coverage uses baseline weights, not re-normalized output weights.
- Score requires the documented minimum count of metrics and pillars. Ensure all-missing inputs return `overallScore: null` and `tier: null`.
- Metric/pillar/overall scores never leave `[0,100]`; same input and policy produce the same output.
- Every metric preserves the expected provenance, period, as-of and assumptions. Estimates must not become bank-verified.
- Tests of 3-month inputs do not accidentally reuse only current-month cashflow; posted, pending, reversed, internal transfer, refund and card payment handling follows existing cashflow semantics.

## 3. Proactive rule tests

For every rule:

- Trigger, no-trigger, just-before-boundary, exact boundary and just-after-boundary.
- Missing or stale inputs suppress rather than invent a number.
- The generated candidate has stable identity, rule/policy version, period, provenance/freshness and only allowed actions.
- Date rules use passed `now`, Vietnam date-only boundaries, leap dates, invalid date, already-overdue date and 30/7/3-day windows.
- Do not treat minimum card payment as full statement balance.
- Do not treat an empty result set as evidence of no obligation unless source completeness says so.
- Jar limits and jar balances are not interchanged; no-limit means unknown; a covered rebalance does not duplicate a residual/pressure warning.
- Spending spike uses a documented comparison window, positive baseline and both relative and absolute materiality; no inference about causation.
- A refund uses `relatedTransactionId`/event ID safely and is not double-counted.
- Unallocated pool reuses canonical `Financials.unallocatedPool`, and reserves upcoming obligations before any optimization insight.
- A blocked data rule emits no candidate.

## 4. Dispatcher and persistence tests

- Priority ordering stable under ties; output ordering deterministic.
- Suppression happens before top-N selection where policy requires.
- Same customer/rule/entity/period is deduplicated; different entities or materially new semantic states are not incorrectly merged.
- Exact same input reuses cache; material change updates/supersedes according to chosen cache; presentation-only changes do not change financial metrics.
- Dismissal does not mark a still-true financial issue resolved; stale/non-active versions cannot be dismissed.
- Operational notices do not count toward product-offer quota.
- Event writes are idempotent; no duplicate active versions; transaction boundaries are tested.
- No migration test or dev instruction runs `npm run db:seed` as a schema migration.

## 5. LLM/narrative tests

- Missing/invalid model configuration, timeout, bad JSON, extra fields, number/date in narrative if prohibited by contract, unknown fact IDs, unallowed action, URLs, or invented product IDs result in deterministic fallback.
- Narrative may not change candidate, severity, priority, semantic state, metrics, source, as-of or CTA routing.
- Merchant/category/transaction-note text is treated as untrusted data, not instructions.
- The LLM request excludes CIF, full account numbers, raw transaction rows and unrelated personal records.
- Existing tests in `src/insights/proactive/copy-contract.test.ts` must remain valid or be deliberately migrated.

## 6. API and UI tests

- Keep request limits, invalid JSON, invalid demo identity, invalid profile input, invalid interaction, and `Cache-Control: no-store` behavior.
- Test the active `POST /api/proactive-insights/current` response as consumed by `HomeInsightWidget`.
- Test success, no candidate, dismissed insight, stale state, error/retry, loading, insufficient health data, and model fallback.
- Do not introduce a GET-only contract or switch DTOs unless producer, endpoint, consumer and tests move together.
- User interactions may navigate or prepare a draft; no test or code path should execute a financial transaction automatically.

## 7. Definition of done

The feature is done only when:

1. Code path is single and documented; no third proactive pipeline exists.
2. Health score policy is centralized/versioned; score coverage and missing-data semantics are visible.
3. Each shipped rule has a registry entry and deterministic tests.
4. Active UI only shows rules whose required evidence is present and fresh enough.
5. Candidate metrics are the source for all displayed numbers; LLM adds no factual numbers.
6. No duplicate warnings across legacy detector and Home path for the same event.
7. API remains compatible or the migration is complete/tested atomically.
8. Relevant tests, full tests, build and lint outcomes are documented honestly.
9. `docs/ARCHITECTURE.md` and `docs/DATA-READINESS.md` reflect what was actually shipped, not the target plan.
10. Every known blocked data family is either disabled or implemented with a source adapter and tests.
