# 03 — Proactive Insight rule registry

This document is the human-readable rule catalog. The machine-readable starter registry is `proactive-rule-registry.json`. Keep both synchronized when triggers, thresholds, required fields, priorities, copy, or source readiness change.

## 1. Lifecycle/status meanings

- **ACTIVE** — implemented in a relevant code path today; tests and live-route status must still be respected.
- **PARTIAL** — some underlying data/rule exists, but the product-level insight described here needs more logic or a source adapter.
- **BLOCKED_DATA** — must not emit until its required source is added and validated.
- **PROPOSED** — target behavior only; no implication that the current app implements it.

“Implemented somewhere in `src/insights`” does not automatically mean the rule is rendered by the active Home widget. See the live-path map in `01_REPO_AUDIT.md`.

## 2. Group A — product and operational events

### A1 — Deposit maturity (`deposit_maturity`)

- **Status:** `BLOCKED_DATA`.
- **Needed:** deposit record/product with maturity date, principal, currency, term/rate as of the record, maturity instruction, source and freshness.
- **Trigger:** maturity date falls within a configurable lead window (default prototype: 3 calendar days); one event per deposit and maturity date.
- **Copy boundary:** say “sổ tiết kiệm sắp đáo hạn”; do not predict lost interest unless rate, tenor, principal, tax/fees and reinvestment terms are verified and the deterministic engine calculates the scenario.
- **Allowed next step:** open a product/account detail or initiate a review conversation. No automatic renewal or withdrawal.

### A2 — Confirmed obligation / minimum payment due (`known_payment_due_reminder`)

- **Status:** `ACTIVE`; active in live snapshot candidate path (`payment:next7`) and `src/insights/proactive/core.ts` with exact minimum payment semantics and VN date calculation.
- **Needed:** liability ID/name, due date, minimum payment, data source/freshness; separate full statement balance only if the source actually contains it; payment status if asserting paid/unpaid.
- **Trigger:** known positive minimum payment, valid VN date, due date in 0–30 days. Escalate to urgent when `daysUntilDue <= 7`.
- **Copy boundary:** never label `minimumPayment` as full statement due and never claim a liquidity shortfall without a separate forecast.
- **Allowed next step:** open payment overview or assistant review. Payment itself still requires normal human action.

### A3 — Refund received (`refund_received`)

- **Status:** `ACTIVE`; active in live snapshot candidate path for posted refunds within recent 3-day window (`refund:${id}`).
- **Needed:** posted refund, valid original link when available, stable transaction ID, category/jar impact, source and freshness.
- **Trigger:** newly observed posted refund not already surfaced. One insight per refund transaction; avoid re-trigger on every fetch.
- **Copy boundary:** state refund received only from the posted record. Do not count it as fresh income and do not double-subtract the original expense.
- **Allowed next step:** view transaction or budget detail; saving/redistribution is optional and needs explicit review.

## 3. Group B — cashflow and budget risks

### B1 — True liquidity shortfall (`cash_liquidity_risk`)

- **Status:** `BLOCKED_DATA` until the forecast has complete-enough upcoming obligations and trustworthy available balance/current source freshness.
- **Needed:** available CASA (not generic account balance), source time, explicit known obligations, estimated recurring bills clearly separated, and a deterministic forecast horizon.
- **Trigger:** projected available CASA drops below zero or a configurable reserve floor after accounting for all selected events in that horizon. Do not combine an estimated bill with a confirmed statement as if both were confirmed.
- **Copy boundary:** if the forecast includes estimates, state that it is an estimate. No assertion about “will lack money” if completeness is insufficient.
- **Allowed next step:** view cashflow/obligations; any rebalance or transfer must be a reviewable draft.

### B2 — Jar budget pressure (`jar_plan_pressure` / existing `jar_pressure`)

- **Status:** `ACTIVE` in existing detectors/core; verify its path before making it the sole Home detector.
- **Needed:** current-period `JarBudgetLine`, configured limit, spend, balance, days left, source/freshness.
- **Trigger:** keep the existing domain semantics: configured limit only; `spent/limit >= 0.8` may mean near limit; over-limit and negative balance are distinct states. A jar with no limit is unknown and does not trigger a limit warning.
- **Important distinction:** negative jar balance = jar needs cover; over limit with nonnegative balance = plan/budget breach, not necessarily a liquidity shortage. Respect existing dedupe with covered rebalances.
- **Allowed next step:** review budget/jar or ask assistant; no autonomous money movement.

### B3 — Spending category spike (`spending_spike`)

- **Status:** `ACTIVE` in `src/insights/detectors/spending-spike.ts` and `src/insights/proactive/core.ts`; Home path must be checked.
- **Current candidate baseline:** current category spend > prior spend × 1.3 AND absolute increase >= 500,000 VND, with positive prior spend. This is a prototype threshold, not a statistical anomaly guarantee.
- **Required improvement check:** current-to-prior comparisons should use comparable elapsed windows when evaluating an incomplete current month, or document/mitigate early-month bias. Preserve the existing rule unless tests and change notes explicitly justify modifying it.
- **Copy boundary:** state “chi tăng so với kỳ so sánh”; do not infer the cause or say the spending was unnecessary.
- **Allowed next step:** review relevant transactions/chart or edit a budget alert if such UI is implemented.

## 4. Group C — recurring payments and income events

### C1 — Recurring expense/subscription (`recurring_summary` / future `recurring_change`)

- **Status:** `ACTIVE` for recurring summary; `PARTIAL` for a newly detected subscription, renewal, or price increase.
- **Needed:** `detectRecurring` output with merchant, interval, amount, confidence/source, observations and comparison history.
- **Trigger:** current detector may summarize expense recurring items. New-specific insights must require stable merchant identity and multiple repeat observations; price-increase insight must compare amounts for the same merchant/plan and pass an absolute-materiality threshold.
- **Copy boundary:** call recurrence estimated when predicted, not confirmed. Do not state cancellation/refund policy as fact without a source.
- **Allowed next step:** view transaction/recurring details or ask assistant; never cancel on behalf of the user.

### C2 — Income received / unallocated pool (`income_allocation_opportunity`)

- **Status:** `PARTIAL` — posted income and `unallocatedPool`/`unallocatedPool.amount` exist, but a distinct post-payday trigger/fatigue rule is not yet established.
- **Needed:** newly posted income event ID/time, current CASA available balance, existing unallocated pool, upcoming obligations/reserve, jar/goal preferences.
- **Trigger:** only after a new eligible income event and if safe unallocated amount remains after obligations/reserve. Do not treat all CASA as unallocated or idle cash.
- **Allowed next step:** preview allocation or edit a plan; user confirms every operation.

## 5. Group D — idle cash and optimization

### D1 — Long-held CASA cash (`idle_cash_90d`)

- **Status:** `BLOCKED_DATA`.
- **Needed:** reliable balance time series (daily or defensibly sampled), historical earmarked reserve/obligation policy aligned to each observation, data freshness and an explicit liquidity buffer.
- **Trigger:** only after the amount can be shown to remain above the protected reserve floor throughout the full 90-day window. Do not subtract today’s jar balances from a historical minimum balance.
- **Copy boundary:** call it “tiền duy trì ổn định/chưa phân bổ” only if supported by history; never assert idle cash from a current CASA snapshot alone.

### D2 — Month-end leftover in jars (`jar_month_end_surplus`)

- **Status:** `PARTIAL`.
- **Needed:** completed prior-month jar snapshot, spent, limit, available balance/ledger semantics and current month rollover rules.
- **Trigger:** only after a period closes and after ensuring leftover was not already carried/reallocated. No duplicate per page view.
- **Allowed next step:** review next-month budget or preview saving; default is to keep money in place unless the user chooses otherwise.

### D3 — Safe surplus/product exploration (`safe_surplus_products`)

- **Status:** `PARTIAL` in `src/insights/proactive/opportunity.ts`, not necessarily active in Home route.
- **Existing safety posture:** current code requires known VND current account availability, configured spend jars/limits, reserve buffer, complete debt facts, no overdue/high-cost debt under its policy, and valid goal facts before emitting. Keep fail-closed behavior and tests.
- **Trigger:** only when all required reserve/debt/goal/spending inputs are valid and safe surplus exceeds the current configured threshold.
- **Copy boundary:** invitation to explore information, not financial advice or a guaranteed outcome. Do not hardcode example interest rates from the brainstorming note.

## 6. Dispatcher requirements

1. Eligibility before ranking: missing required data, stale data, bad timestamps, invalid/unsafe amounts, or contradictory facts suppress a candidate.
2. Stable priority classes: respect current `P0`–`P5` in `src/insights/proactive/core.ts` or document any change in one policy constant. Preserve suppression rules; high-priority events can suppress low-priority product/optimization candidates.
3. Deduplicate by stable rule/entity/period/event ID, not only rendered text.
4. Cache by canonical feature values plus policy/rule version; never cache stale numeric prose. Numeric facts should stay in structured metrics.
5. `displayed` does not resolve an insight. Dismissal changes delivery state/cooldown only; a financial rule resolves when the trigger is no longer true or the source event is otherwise completed.
6. Limit pushes to one highest-priority push per day only if push delivery is actually implemented. Current Home card/feed behavior should not pretend it sends push notifications.
7. Keep operational notifications (refund, due-date reminder) separate from commercial offer quota.
8. Default to deterministic approved Vietnamese copy. Model generation is optional, validated, and must fail closed to deterministic copy.

## 7. Anti-spam initial defaults

These are prototype defaults and should be centralized in policy/config, not scattered through UI:

- Home: at most one primary card from the dispatcher per request/render cycle, matching the existing widget experience.
- Same unchanged snapshot dismissed: suppress for 24 hours, matching current `home_insight_cache` behavior unless explicit UX approval changes it.
- Product offer quota: proposed 4 displayed commercial offers per rolling 30 days; do not count operational reminders or refunds. Do not enable quota until the event store distinguishes offer display from general insight display.
- Repeated same family dismissed twice: proposed snooze 30 days, but keep disabled until event history can reliably determine same family and consecutive dismissal. Do not simulate this using only a single `dismissed_until` field.
