# Proactive Insight v1 QC and release gate

`READY` in the registries is **data/rule readiness** for the DB-backed demo, not a production security claim. Mark a row PASS only with an automated assertion or a recorded manual check against the cited source. The Home widget, SQLite Store, and deterministic copy are now mounted; the LLM adapter remains a future option. Targeted tests include `core.test.ts`, `copy-contract.test.ts`, `store.test.ts`, and `HomeInsightWidget.test.tsx`.

| Area | Required test cases / expected behavior | Current coverage / gate |
|---|---|---|
| Source lineage | Trace every READY raw field through SQLite model/store/API/provider/`useFinancials`/engine to candidate and DTO. Change a DB jar limit and a posted expense; UI, `/api/jar-summary` and candidate must agree **unless** session topup is active. Verify no rendered-DOM scraping. | Source paths documented; parity integration pending. |
| Jar axes | `spent>limit, remaining>=0` means covered over-limit, still a plan warning; `remaining<0` means needs cover; UI shows 0 balance plus positive uncovered amount. Rebalance changes remaining but not spent/limit. | Pure P1 state test added; existing `jar-budget` and UI tests. |
| Known payment P0 | Only positive known `Liability.minimumPayment` with valid in-horizon due date; predicted recurring series, unknown amount, overdue or invalid date cannot become a contractual reminder. Never describe minimum payment as full statement or assert liquidity shortfall. | Pure P0 candidate test added; copy semantic evaluation and source-freshness integration pending. |
| Feature units | Whole VND input/output; refunds subtract, card payment/transfer/rebalance/pending/reversed excluded; one expense category belongs to one jar; category correction/hidden flag changes the correct jar once. | Existing engine tests; new end-to-end candidate fixture pending. |
| Trigger boundaries | 79.9999% no near, 80% near, exactly 100% near, >100% over; 0 limit with 0 spend safe; 0 limit with positive spend over; current vs closed month; days-to-empty at cycle boundary. | P1 80%, below, zero, closed period tests added; remaining boundaries pending. |
| Priority conflicts | P0 > P1 > P2 > P3 > P4 > P5 even if lower priority severity is urgent; stable tie by ID; top N after suppression. | P1/P2/P4/P5 tests added; P0 integration pending. |
| Hard suppression | Any active P0/P1 suppresses P4/P5 regardless of dismiss, cooldown, or copy failure; no positive card when risk scan incomplete. | Resolver test added; lifecycle and incomplete-scan integration pending. |
| Cooldown/display fatigue | Reopen Home repeatedly: no duplicate display event, no premature resurfacing after dismiss; material escalation can override cooldown by approved policy; persona/version scoped. | SQLite event idempotency and dismissal tests pass; timed cooldown remains pilot work. |
| Cache exact hit/miss | Same relevant fingerprint, key order or Home refresh → same record, zero LLM calls. Change jar balance, period, label, customer, source revision or rule version → miss. Concurrent requests issue one model call. | Fingerprint/customer/metric tests added; DB/concurrency pending. |
| Same semantic state | Small spent change while state/action remain near → numeric metrics update, validated numeric-free copy reused, zero LLM calls. Copy containing old digits or unapproved action is never reused. | SQLite repository version/copy reuse test passes; output guard tests pass. |
| Material state change | near → needs_cover, severity change, entity change, cycle rollover or rule version change → new version, old record superseded atomically; resolved/expired transitions audited. | SQLite supersede/resolve tests pass; explicit expiry remains pilot work. |
| LLM output/hallucination | Schema and Unicode-digit rejection; extra `product_id`, unknown fact/action rejected; no invented cause/due date/intent; estimated vs verified wording; bad/malformed/timeout output uses fixed fallback or skips. | Mechanical output guard tests added; semantic adversarial eval and adapter tests pending. |
| Stale snapshot | Account `lastSyncedAt`, transaction `postedAt`, liability `lastUpdatedAt` checked against approved TTL; a late/batch transaction triggers recompute and supersede. `postedAt` alone is not ingestion watermark. | TTL and watermark design/policy pending. |
| Null/missing/division | Unset jar limit remains null and suppresses; missing CASA/liability due amount/date suppresses dependent rule; previous category spend 0 suppresses percent spike; no divide-by-zero/NaN/Infinity. | P1 null/zero/Infinity test added; P0/P2 integration pending. |
| Negative/outlier | Negative jar `remaining` retained internally but UI never prints negative balance; negative CASA/overallocated pool never becomes P4; huge unsafe integer, corrupt payload and impossible future amount fail closed. | P1 negative test added; load-boundary tests pending. |
| Delayed ingestion | Late posted transaction or correction after first render invalidates fingerprint; no stale cached copy with embedded amount. Partial transaction load does not look like zero spend. | Integration pending. |
| Time boundaries | `+07:00` transaction at VN day/month boundary; leap day, 28/29/30/31-day month; 00:00/23:59 cycle rollover; fixed demo clock vs trusted production clock; due-date-only semantics. | Existing `period-timezone` tests; new pipeline tests pending. |
| Persistence/audit | Active, resolved, superseded, expired; display/dismiss/ack events idempotent; audit includes rule/source versions and no raw PII; store transaction rollback on failure. | Additive SQLite tables and active/resolved/superseded/dismissed/display tests pass. Expiry/ack and source-version columns remain pilot work. |
| Cross-customer isolation | Two CIFs with same jar ID/facts get separate fingerprint/store rows/events; switching persona never flashes previous insight; client cannot request another CIF by query param. | Fingerprint and SQLite per-CIF isolation tests pass; session authentication remains absent in the demo API. |
| UI/widget | Loading/error/insufficient states distinct from a valid empty result; CTA allowlisted; metric chips from engine; accessibility/long Vietnamese label; no P4/P5 while risk active. | Home widget mounted; render, CTA, dismiss and session-topup hiding tests pass. Error and no-candidate both hide the card in the MVP. |

## Required release sequence

1. Run targeted/new tests, full Vitest suite, TypeScript typecheck, and ESLint. Capture exact command/status in implementation PR.
2. Add snapshot parity integration test for `GET /api/jar-summary` against `useFinancials`, including a session topup; resolve the expected divergence before server persistence.
3. Add Store tests with a fake copywriter counter: exact hit and same-semantic hit each make **zero** model calls; material change makes at most one call under concurrent opens and supersedes atomically.
4. Add API auth and cross-customer tests. Current `?cif=` prototype endpoints are not a production trust boundary.
5. Run adversarial copy evaluation on every READY state. Mechanical schema validation alone cannot prove absence of unsupported financial claims; until this passes, use deterministic fixed copy.

## Definition of Done for Home activation

The **demo MVP** is active: P1/P2 raw fields are DB-traced, Home widget is mounted, cache/version/dismissal persistence is tested, and API smoke checks against the local DB pass. The **production gate** remains open: session authentication, max-age/source revision policy, explicit expiry/cooldown, full snapshot parity for session top-ups, and optional LLM adversarial evaluation need completion. P0/P3/P4/P5 remain disabled until their registry blockers are closed.

## Verification record, 2026-09-23

- `npm test`: 128 files, 1,140 tests passed (before two additional widget tests); targeted widget/proactive run: 4 files, 20 tests passed.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed with the existing `TransactionListSection.tsx` hook dependency warning.
- `npm run build`: passed; `/api/proactive-insights/current` appears as a dynamic route.
- Local SQLite: `PRAGMA integrity_check` returned `ok`; GET returned P1 cards for CIF_0001/0002/0003 and no candidate for CIF_0004; repeat GET returned `exact_reuse` and unchanged version.
