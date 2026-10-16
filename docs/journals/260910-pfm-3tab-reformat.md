# 2026-09-10 — PFM 3-tab reformat

Plan: `plans/260909-2254-pfm-3tab-reformat/` (pre-existing, red-teamed 6-phase plan, executed this session).

## What changed

`/pfm` reformatted from 4 tabs (Tổng quan · Dòng tiền · Kế hoạch · Trợ lý) → 3 tabs (Tổng quan · Hũ · Dòng tiền).

- **P01 — engine helper**: new `src/domain/engine/category-jars.ts` — `groupSpendingByJar` (folds `spendingByCategory` by jar, orphan categories → `"Khác"` catch-all, first-wins dedup on multi-jar category mapping), `jarChipList` (spend-independent, for filter UI), stable `KHAC_JAR_ID` constant. 12 tests incl. total-conservation (Σjar spend ≡ total spend) and parity vs `evaluateJarPartition` (RT #9).
- **P02 — Hũ promoted**: moved from a Dòng tiền sub-hub dock to a top-level tab (`src/components/pfm/HuTab.tsx`). Balance-lens Model A partition (Σhũ ≡ balance, engine-owned) unchanged — this is a navigation/IA move, not an engine change.
- **P03 — Dòng tiền rebuilt** as a pure category-chart view (`CashflowChartView.tsx`): Recharts donut + category bar list + jar filter chips; stable `categoryId→color` map (`src/lib/category-colors.ts`, RT #8); MoM delta renders `"—"` when prior period is empty rather than fabricating a % (RT #10, upholds "missing stays unknown"); category tap drills to `/transactions?category=`, validated against `CATEGORY_BY_ID` before navigating (RT #3). 6-month trend relocated here from the old cashflow sub-hub (RT #2). Monthly advisory report demoted to a `ReportBriefSheet` CTA (still the templated/deterministic brief from the IA-redesign session, not LLM-narrated — unchanged scope cut).
- **P04 — Kế hoạch + Trợ lý tabs unmounted**: UI removed from the tab spine, but the deterministic engine (goals, `financialHealth`, `simulateSurplus`), the AI facade, and their tests are all **kept** — components carry `DEFERRED` banners, not deleted. `copilot-nav.ts` rewritten: `open-plan` intent removed from the whitelist, former open-plan CTAs remapped to `open-hu`, `dock` query params retired. Redirect stubs added: `/pfm/jars` → `?tab=hu`, `/pfm/insights` → `/assistant`, `?tab=cashflow&dock=hu` normalizes to `?tab=hu`. Assistant moved to a standalone `/assistant` route; its empty state now embeds the `InsightsView` feed (so the insights feed isn't lost with the Trợ lý tab).
- **P05 — visual reformat** per a frozen `visual-checklist.md` (RT #15), style-only: unified pill language, ≥44px touch targets, `gap-5` rhythm, `SectionHeader` action-slot, 8-color palette retuned to an accent-anchored warm family (slot ordering preserved so existing chart/jar color assignments don't shift), bar-row polish. `OverviewTab` deliberately kept its tighter gap — 1-viewport `overflow-hidden` constraint takes precedence over the new rhythm rule there.
- **P06 — gate**: fixed one stale test-harness gap (`ChatPanel.test.tsx` needed the full provider stack once `InsightsView` got embedded into the assistant empty state). Final state: `tsc` clean, vitest 335/335 across 50 files, `npm run build` exit 0, code-review score 9/10 with 0 critical findings — all architectural invariants explicitly re-verified as held. Backlog updated with deferred-UI notes plus new `EPIC-14` tech-debt follow-ups (dead `SuggestedPrompts`/`SUGGESTED_PROMPTS` export, file-size splits, DRY nits).

## Why

Simplify the `/pfm` spine from 4 tabs to 3 by promoting Hũ (already redesigned as a balance-lens partition, see `260909-hu-balance-lens-redesign.md`) to a first-class tab and refocusing Dòng tiền purely on category-level charting, while deferring Kế hoạch/Trợ lý as standalone UI rather than deleting the underlying engine/AI work — keeps the calculation engine and AI facade reusable when those flows return, avoids re-litigating already-shipped domain logic.

## Invariants explicitly preserved (verified in P06 review)

- Deterministic engine remains sole source of financial truth — this session only added a pure grouping helper (`category-jars.ts`) on top of existing `spendingByCategory`/`evaluateJarPartition`, no new financial computation logic, and parity-tested against the existing jar engine.
- AI stays a non-committing facade — no changes to the tool tiers or LLM pipeline; only chrome/routing around it moved.
- Navigation stays a static whitelist — `resolveIntentRoute`/`copilot-nav.ts` updated but remains a hand-maintained code map, no LLM-driven routing introduced.
- Provenance / "missing stays unknown" — MoM delta in the new chart view shows `"—"` instead of a computed percentage when the prior period has no data, rather than defaulting to 0%.

## Impact

- `/pfm` route: 3 tabs live (Tổng quan · Hũ · Dòng tiền); Kế hoạch/Trợ lý UI unmounted (engine/AI code intact, `DEFERRED` banners on components).
- New reusable engine helper `groupSpendingByJar`/`jarChipList` available for any future jar-aware view.
- Old routes (`/pfm/jars`, `/pfm/insights`, stale `dock=` query params) redirect/normalize instead of breaking.
- Assistant now lives at `/assistant` as a standalone route; its empty state surfaces the insights feed.
- Test suite grew to 335/335 passing across 50 files (was smaller pre-session; category-jars + brief + goal-parity + asset-liability/goal-input tests are new since the IA-redesign session).

## Follow-ups

- `EPIC-14` tech-debt backlog items opened this session: remove dead `SuggestedPrompts` component / `SUGGESTED_PROMPTS` export, split oversized files, DRY nits flagged in code review.
- Kế hoạch/Trợ lý UI remains deferred — re-mount decision is a future product call, not a technical blocker (engine + AI facade are ready to re-wire).
- Dòng tiền · Báo cáo brief is still templated/deterministic, not LLM-narrated (tracked pre-existing under `EPIC-07`/`PFM-062`, unchanged this session).
- Changes are **not committed** — user chose to review the diff manually before committing.
