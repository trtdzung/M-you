# 01 — Repository audit and current source map

## 1. Stack and implementation context

- Next.js App Router, React, TypeScript, Tailwind CSS, SQLite (`better-sqlite3`), Vitest/Testing Library.
- The current source archive does not contain `plans/project-backlog.md`, although `CLAUDE.md` references it. Do not fabricate that backlog; use this feature pack and the actual code as the source of truth for this task.
- The packaged source archive does not contain `node_modules`. Install dependencies in the developer environment before running tests; do not interpret missing dependencies as a code failure.

## 2. Current financial engine

| Responsibility | Actual file | Notes |
|---|---|---|
| Canonical records | `src/domain/models/index.ts` | Defines `DataSource = msb / self_reported / estimated / mock`, accounts, transactions, assets, liabilities, goals, `Insight`, and `InsightFact`. |
| Financial calculation composition | `src/domain/engine/finance-compose.ts` | `computeFinancials(raw, month, options)` is pure; it merges context-provided user records once and returns the shared `Financials` object. Do not put SQLite/provider I/O here. |
| Engine exports | `src/domain/engine/index.ts` | Re-exports existing pure calculations, including `health.ts`. |
| Existing health indicators | `src/domain/engine/health.ts` | Only exposes `runwayMonths` and asset `concentration` today. It does NOT implement a 0–100 overall health score. Missing indicators use `null`; provenance is currently `estimated`. |
| Client financial composition | `src/state/useFinancials.ts` | Loads Providers, applies corrections/hidden policy, then calls `computeFinancials`. `Financials` is re-exported from this hook for existing consumers. |
| Provider abstraction | `src/providers/interfaces.ts`, `src/providers/context.ts` | Domain/UI must not read mock fixture files directly. |

## 3. Existing insight logic

| Responsibility | Actual file | Notes |
|---|---|---|
| Canonical insight shape | `src/domain/models/index.ts` (`Insight`, `InsightFact`) | Existing insight shape is already available; avoid introducing a second almost-identical `Insight` interface. |
| Legacy/current feed detectors | `src/insights/detectors/*.ts`, `src/insights/run.ts` | `runDetectors(financials)` runs jar pressure, jar overspend/covered, upcoming obligation, spending spike, and recurring summary. These are pure functions over `Financials`. |
| Detector typing | `src/insights/types.ts` | `Detector` and `MultiDetector`; currently imports `Financials` through `src/state/useFinancials.ts`. Do not broaden this client-layer coupling; a later refactor may import directly from `finance-compose.ts` if it is scoped and tested. |
| Existing Home candidate core | `src/insights/proactive/core.ts` | Contains `knownPaymentCandidates`, `jarPlanCandidates`, `spendingPressureCandidates`, and `resolvePriority`. These are pure candidates, but are not the active Home widget call path identified below. |
| Candidate persistence | `src/insights/proactive/store.ts` | Has versioned `active/resolved/superseded/dismissed/expired` states and event recording backed by SQLite tables. It is used by `src/lib/proactive-insights-service.ts`. |
| Existing product opportunity | `src/insights/proactive/opportunity.ts` | Fails closed on missing reserve, jar, debt, goal, and spend inputs. Do not loosen these checks just to display an offer. |

## 4. The live Home widget path — preserve its contract

The currently wired UI path is:

```text
src/components/home/HomeInsightWidget.tsx
  → POST /api/proactive-insights/current
  → src/app/api/proactive-insights/current/route.ts
  → src/lib/home-insight-service.ts :: generateHomeInsight()
  → src/lib/financial-snapshot-service.ts :: customerSnapshot()
  → src/insights/proactive/snapshot.ts :: buildCustomerSnapshot()
  → candidate list + optional external agent for copy/selection
  → HomeInsightResult { insight: HomeInsight | null, cached, reason? }
```

Important behavior observed in current code:

- The widget submits `{ cif, profile: { assets, liabilities, goals, complete } }` and may include session top-ups through the snapshot machinery. Profile records are validated before entering the snapshot.
- `HomeInsightWidget` expects `HomeInsight` from `src/insights/proactive/home-contract.ts`, whose `candidate` has a metric, topic, action (`overview`/`chat`), confidence, and facts.
- `src/app/api/proactive-insights/current/route.ts` accepts POST, validates the demo CIF, records `displayed`/`dismissed` events using `snapshotId`, and calls `generateHomeInsight`. Do not change it to GET or swap its response type without updating the widget and tests in the same migration.
- `src/lib/home-insight-service.ts` uses `home_insight_cache`, deduplicates in-flight work, has a 24-hour dismissal period, and has a deterministic fallback. An optional agent call may return only a validated candidate selection and short title/body; fallback remains available if the call fails.
- `src/insights/proactive/snapshot.ts` already generates payment, estimated recurring-bill, jar-pressure/burn-risk, and spending candidates. Inspect the whole file before adding candidates so rules do not duplicate existing ones.
- `src/lib/financial-snapshot-service.ts` creates a demo dataset and merges validated self-reported records; server/current data sources and corrections must be rechecked before making score claims.

## 5. A second, currently unconnected pipeline exists

`src/lib/proactive-insights-service.ts` defines `currentHomeInsight()` and `trackHomeInsight()`; it composes SQLite data, `computeFinancials`, candidates from `src/insights/proactive/core.ts`, and versioned `src/insights/proactive/store.ts`.

A source scan of this archive found no UI/API caller for these functions. The Home route above imports `home-insight-service.ts`, not `proactive-insights-service.ts`. Treat the latter as a partially implemented alternate pipeline until confirmed otherwise. Do not route the widget into it casually: its DTO and profile-loading behavior differ from the active Home contract.

**Required before migration:** inspect all call sites and tests; write down which service is authoritative; preserve behavior with characterization tests; migrate once, not by creating a third implementation.

## 6. Profile endpoint and data gaps

- `src/app/api/proactive-insights/profile/route.ts` calls `syncFinancialProfile(cif, liabilities, goals)`; it does not currently sync assets.
- Current `HomeInsightWidget` passes `assets`, `liabilities`, and `goals` in its request body to the current route, and `customerSnapshot()` validates these body overlays. Do not assume `/profile` is the active UI path.
- `Account` does not have a deposit maturity date or maturity instruction.
- `Liability.minimumPayment` is the minimum payment, not a credit-card full statement balance.
- No verified card statement schedule/history is identified in the current model.
- `Account` has current balance and `lastSyncedAt`, but there is no established daily CASA balance time series in the visible domain model.
- `Goal` has `targetAmount`, `currentAmount`, `targetDate`, and `source`, but no start date or contribution history.
- `Transaction` has `refund` and `relatedTransactionId`; refunds must not be naively double-counted as spend or income.
- User-entered values and mock rows must keep their provenance. Incomplete source coverage should disable a rule rather than trigger an optimistic inference.

## 7. Critical semantics already encoded in the repo

- Internal transfer/rebalance records do not represent ordinary expenses or income.
- `pending` and `reversed` records are not posted spend/income truth.
- Hidden/corrected transaction policy is applied in the client financial view; server calculation must be consciously aligned, not assumed identical.
- Jar limit and jar available balance are different concepts. The current BIDV wallet jar model groups expense categories and tracks a monthly limit; it is not an investment pot or an independent bank account.
- `unallocatedPool`/`unallocatedPool.amount` should be reused rather than recomputing the available CASA pool from unrelated fields.
- The code uses Vietnam calendar-day semantics (+07:00) in date-based rules. Use the passed reference `now` and test boundary days.

## 8. First inspection commands for a coding agent

```bash
rg "generateHomeInsight|currentHomeInsight|trackHomeInsight|runDetectors" src
rg "interface FinancialHealth|interface Financials|interface Goal|interface Liability" src
rg "proactive_insights|proactive_insight_events|home_insight_cache" data/schema.sql src
```

Run these before changing endpoint routing or persistence. Search results may change after implementation; update this document if the architecture is genuinely migrated.
