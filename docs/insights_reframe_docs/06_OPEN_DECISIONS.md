# 06 — Open decisions and safe defaults

This file is intentionally explicit about what the coding agent may decide and what it must keep blocked. “Model can implement” does not mean “model can invent missing financial data”.

## Safe defaults the coding agent may implement

1. **Index name:** call it `PFM Financial Health Index` or `Financial Health Score (prototype)`, described as inspired by the FHN framework. Do not call it the official FHN FinHealth Score or suggest endorsement/licensing.
2. **Pillar policy:** four equally weighted pillars; two metrics per pillar; 12.5% baseline weight per metric; policy stored in one versioned constant.
3. **Score visibility:** require at least 3/4 valid pillars and 5/8 valid metrics; otherwise `overallScore = null` and return precise missing-data reasons. This is a tunable product default, not a universal standard.
4. **Prototype tiers:** `healthy >= 80`, `coping >= 55`, `vulnerable < 55`; centralize and version them. Use neutral Vietnamese copy that avoids judgment (“Tương đối ổn định”, “Cần chú ý”, “Cần ưu tiên củng cố”) if UX labels can be changed safely.
5. **Home UI:** one primary insight per current Home widget request, preserving current design. In-app feed / push notification delivery is not inferred from the existing widget.
6. **Current dismissal:** preserve the current 24-hour same-snapshot suppression until product approval says otherwise.
7. **Narrative default:** deterministic templates; model copy is optional and must fail closed.

## Must remain blocked until reliable data exists

| Capability | Why blocked | Enable only when |
|---|---|---|
| Long-held CASA cash for 90 days | Current model has no reliable daily balance time series | Daily/sampled historical balance and aligned protected reserve data exist for the full window |
| Term-deposit maturity | `Account`/`Asset` does not include maturity date/instructions | A sourced deposit/maturity record with due date, principal, rate/terms and freshness exists |
| Full credit-card payment due | Current liability includes `minimumPayment`, not necessarily statement balance | A statement record distinguishes full due, minimum due and payment status |
| Positive on-time payment score | Absence of penalties is not proof of paid-on-time obligations | Due obligations and actual paid timestamps/status are linked |
| Credit behavior/bureau score | No trusted source or mapping is configured | A permitted source and a reviewed mapping to the policy scale exist |
| Insurance absence | No premium txn cannot prove no coverage | Explicit user declaration or a verified insurance/product record exists |
| On-schedule goal score | Current goal lacks start date/contribution history | An explicit schedule, dated goal history or approved expected-contribution policy exists; otherwise use only completion ratio |
| Reliable cash-liquidity-shortfall claim | Forecast coverage and event completeness can be partial | Current available cash, source freshness, due obligations and estimates are all represented distinctly |
| Product yield/extra interest promise | Brainstorming example rates/dates are illustrative | Current approved product terms and deterministic projection inputs are sourced and timestamped |
| Four-offers-per-month quota and 30-day family snooze | Active Home cache does not yet track the needed offer family/event history | The selected event store records product offer display and family-level dismissals reliably |

## Important design clarifications

- **Score aggregation:** renormalize the score calculation over available pillar scores, but keep `scoreCoverage` calculated with raw configured metric weights. Never let one pillar dominate just because the other pillar's metrics are missing.
- **“No debt”:** only score debt service as zero when completeness is explicitly confirmed. Otherwise `null`.
- **No goals:** `GOAL_PROGRESS` is `null`, not zero. Creating a goal is an opportunity insight, not a financial-health penalty.
- **Savings-rate calculation:** transfers between the customer's own current/savings accounts are not income. Define an accumulation source carefully to avoid double-counting; if reliable accumulation cannot be derived, score `null`.
- **Source types:** reuse `DataSource` when possible. If `derived`/`pfm_config` is needed, represent it in the feature contract deliberately rather than silently widening all model types.
- **Current Home pipeline:** the live endpoint uses `home-insight-service.ts`. The pipeline in `proactive-insights-service.ts` has a different DTO/store and is not observed to be wired in this source archive. Choose one path and document the migration; never combine both without compatibility tests.
- **FHN reference:** this is a product-inspired index, not the exact official/licensed FHN instrument. Official framework and model details may change; review current FHN source if the product wording needs legal or research approval.
