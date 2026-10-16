# Smoke journey — MSB PFM MVP (mock data, localhost)

Date: 2026-09-03 · Scope: Phases 01–08 of `plans/260903-0301-pfm-mvp-mobile-app`

## How to run

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # deterministic engine + insight tests
npm run build    # production build gate
```

Note: `next dev` output is summarized by the local `rtk` hook; run
`rtk proxy npx next dev` to see raw Next.js dev logs when debugging.

## Automated gates (all green)

- `tsc --noEmit` — no type errors.
- `vitest run` — **45/45 pass** (cashflow, net worth, budget, recurring,
  obligations, fixtures/provider, engine↔fixtures integration, insight
  detectors + grounding guard, assistant answers).
- `eslint src/**` — clean.
- `next build` — **0 errors, 0 warnings**, 7 routes prerendered.
- SSR check: every route (`/`, `/onboarding`, `/consent`, `/transactions`,
  `/cashflow`, `/wealth`, `/assistant`) returns HTTP 200 with no error overlay.

> Browser click-through via the Chrome extension could not reach the local dev
> server in this environment (network isolation between the extension host and
> localhost). Validation relied on the automated gates + SSR 200 checks above.
> The manual checklist below should be run in a normal browser before pilot.

## Manual smoke checklist

1. **First run → onboarding.** Fresh browser (no consent) → any route redirects
   to `/onboarding`. Value prop (4 core questions) renders. "Bắt đầu" → `/consent`.
2. **Consent.** Data scopes + purpose, source legend (MSB / Tự khai / Ước tính /
   Demo), persona switcher. "Đồng ý & tiếp tục" → Overview.
3. **Returning user.** Reload → lands straight on Overview (consent persisted).
4. **Overview.** Net worth (with source + freshness), available cash, monthly
   cash flow + MoM delta, income/expense, upcoming obligations (30 days), top 3
   rule-based insights. Every block shows period/source.
5. **Transactions.** Feed lists fixture txns (merchant, VND credit/debit color,
   status chip, source badge). Filters (search / status / category) work.
   Budget section shows ok/near/over. Tap a row → category editor (bottom sheet)
   → change category → budget & cash flow recompute; override persists on reload.
6. **Cash flow.** Income vs expense chart, fixed vs discretionary split, top
   categories, MoM delta. Pending shown separately (not in totals).
7. **Wealth.** Net worth card (unknown-valued asset flagged, not counted),
   6-month trend line, asset/liability allocation with source badges.
8. **Assistant.** Suggested prompts ("Giải thích tháng này", "Tôi tiêu nhiều
   nhất vào đâu?", "Sắp tới phải trả gì?") → templated answers from engine with
   sources. Disclaimer: explains only, never moves money. Insight list with
   dismiss/snooze/helpful.
9. **Persona switch.** From consent screen, switch persona → all screens reflect
   the new dataset after navigating.

## Invariants verified in code/tests

- Deterministic engine is the only source of numbers; UI never imports fixtures.
- Internal transfers & card payments excluded from income/expense; refunds
  reverse category; reversed excluded; pending separated.
- Unknown values stay unknown (net worth coverage); no silent 0.
- Every displayed value carries source + period/freshness.
- Assistant is read-only: no money-movement path exists.
