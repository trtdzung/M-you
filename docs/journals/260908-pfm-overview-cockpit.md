# 260908 — PFM Overview Cockpit

## What shipped
Replaced the scroll-heavy `/pfm` hub with a single client-side route hosting 4 tabs: **Tổng quan (Overview) · Dòng tiền (Cashflow) · Tài sản (Wealth) · Gợi ý (Insights)**. `PfmTabHost` + `PfmTabs` drive tab switching; inactive panels unmount (local UI state resets on switch — accepted trade-off for prototype).

Overview is a no-scroll "4-Question Cockpit": hero net worth + 2×2 KPI grid (Dòng tiền tháng / Cuối tháng estimate / Sắp phải trả / Sức khỏe runway) + top insight strip + worst-case provenance footer. Cashflow and Wealth sub-tabs redesigned around the new engine outputs (trend chart, health panel). Legacy `/cashflow`, `/wealth` etc. now redirect to `/pfm?tab=X`.

Delivered as one release across 8 phases (engine → hooks → components → tabs host → redirects → review fixes).

## New engine modules (deterministic, `source="estimated"` where derived)
- `projection.ts` — `estimateEndOfMonth` (run-rate projection; returns `"unknown"` if any in-window obligation amount is unknown — Red Team finding C1), `cashRunwayMonths` (null when burn = 0, avoids div/0 and false "infinite runway"), `liquidBalance`.
- `networth.ts` (`networthTrend`) — exposes raw current/previous net worth for `DeltaBadge` (C3), tags provenance at the lowest-trust level across inputs (H2), ISO freshness timestamp.
- `cashflow-trend.ts` — per-month income/expense/net with `hasData` flag so a missing month renders as a gap, not a false zero bar (H3).
- `health.ts` — 4 health indicators; concentration indicator carries `hasUnknown` caveat when input coverage is partial (M4).
- `finance-compose.ts` — end-of-month estimate computed **only** for the current month (C2 guard); any other month returns `"unknown"` rather than a stale/misleading projection.

## Key decisions / bugs found in review
- **Critical bug (caught pre-ship):** `OverviewTab` initially read the shared `PeriodContext` month, so picking a past month on the Cashflow tab silently corrupted the cockpit's current-month projection on Overview. Fixed two ways: (1) pinned `OverviewTab` to `currentMonthKey()` via a new `monthOverride` param on `useFinancials`/`useInsights`, (2) added a defensive `isCurrentMonth` guard inside `finance-compose` itself so the engine refuses to compute EOM projection for non-current months even if a caller mis-wires state. Verified manually: selecting August on Dòng tiền left September's cockpit tiles unchanged.
- **No-scroll constraint**: hit 0px overflow at 375×667 dvh floor for both stable and wealthy personas after tuning gaps/padding and switching the hero value to `formatVndCompact`.
- **Honest partial data**: wealthy persona shows known-portion net worth with an explicit "một phần chưa biết" caveat when an asset (unappraised apartment) is excluded — never defaulted to 0.

## Gates passed
`tsc` clean, 185/185 vitest tests passing, `next build` clean, all `code-reviewer` findings (C1–C3, H2–H3, M4 referenced above) fixed before merge.

## Invariants upheld
Deterministic engine remains sole source of numbers; all derived values tagged `estimated` and never presented as bank-verified; missing values render `—`, never silently coerced to 0; UI reads exclusively through providers/hooks, not fixtures; no money-movement code touched.

## Status
Changes are on disk, uncommitted at time of writing (`git status` shows modified engine/state/UI files + new untracked cockpit components, hooks, and tests). Not yet committed to git.

## Follow-ups
- Commit the pending changeset (engine modules, tab host, cockpit components, redirects, docs updates to `ARCHITECTURE.md`/`PRODUCT.md`).
- Consider persisting per-tab UI state across mount/unmount if prototype feedback flags the reset as jarring.
