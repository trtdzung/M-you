# Home Insight Widget: SQLite demo MVP

## Run

From the PFM repo root, run `npm install` if dependencies are absent, then `npm run dev` and open `http://localhost:3000`. Log in through the existing demo gate. The Home card sits below the account summary. It reads the existing `data/pfm.sqlite3`; `getDb()` creates the two new insight tables without resetting accounts, jars, transactions, or corrections. Do **not** run `npm run db:seed` against a demo DB you want to preserve.

The app uses its fixed demo date of 2026-09-15 (VN calendar month 2026-09). The transaction store lazily inserts deterministic mock bank rows into SQLite for a demo persona with no bank rows. These are persisted demo data, **not live bank data**. User edits to jars, manual transactions, and corrections are read from their SQLite tables on the next Home fetch. The UI-only `useJarTopup` overlay is not in SQLite; the card hides for that session after a top-up.

## Demo personas and API

The current DB returns a P1 jar card for `CIF_0001`, `CIF_0002`, and `CIF_0003`. `CIF_0002` demonstrates an urgent negative remaining balance. `CIF_0004` has no eligible risk candidate and correctly shows no card. Persona data can change, so the live DB result takes precedence over these examples.

`GET /api/proactive-insights/current?cif=CIF_0001` returns `{ insight, cache, month, source }`. Repeating the request with unchanged data returns `cache: "exact_reuse"` and the same version. The API computes all financial facts server-side; the browser sends only the demo CIF. `POST /api/proactive-insights/current` accepts `{ "cif": "CIF_0001", "id": "<card id>", "version": 1, "event": "displayed" | "dismissed" }`. The Home X button persists a dismissal. A changed fingerprint may create a new version and show it again.

## Data path and limits

`HomeInsightWidget` → `GET /api/proactive-insights/current` → `proactive-insights-service` → existing account/jar/category/transaction/correction SQLite stores → `computeFinancials` → `jarPlanCandidates` / `spendingPressureCandidates` → `resolvePriority` → `syncSelectedInsight` → `proactive_insights` → widget DTO. The jar amount is `jars.budget_limit − posted net expense from transactions + persisted rebalance net`; no stored jar balance exists. The card does not claim an early-depletion forecast or a payment shortfall.

This is a local demo endpoint, not a production customer API: the CIF is not session authenticated, liabilities/goals are not DB-backed, session-only top-ups are excluded, the copywriter LLM is not called, and a product-approved source freshness/cooldown policy is still needed. The implementation-ready registries and LLM contract remain in this folder for the next phase.
