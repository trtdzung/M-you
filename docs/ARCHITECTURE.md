# MSB AI Personal Financial Management Architecture

## Overview

The reference architecture is a mock-data-first modular monolith with a thin application API, a deterministic financial calculation engine, replaceable data adapters, and a constrained AI facade.

This is the smallest architecture that keeps the prototype fast while preserving a credible path to real MSB integrations. Microservices and autonomous agents are intentionally deferred.

## Architecture goals

- Separate product UI from financial domain logic.
- Make mock data replaceable without changing PFM features.
- Keep all financial numbers deterministic and testable.
- Give AI access only to scoped, structured context and read-only tools.
- Make data freshness, source, consent, and auditability explicit.
- Support progressive delivery from Level 1 to Level 3.

## Logical architecture

```text
Mobile-first UI
      |
      v
PFM BFF / Application API
      |
      +-- Transaction module
      +-- Cash-flow module
      +-- Balance-sheet module
      +-- Asset & liability module
      +-- Goals module
      +-- Insight module
      +-- Recommendation module
      |
      v
Deterministic financial calculation engine
      |
      v
Provider interfaces
  +-- Mock provider
  +-- Future MSB core provider
  +-- Future card provider
  +-- Future investment provider
      |
      v
AI Facade (implemented, Tier A + Tier B)
  +-- Provider-agnostic LLM client (Anthropic default, offline fallback)
  +-- Intent and scope check
  +-- Context builder (reuses the deterministic engine)
  +-- Read-only + simulation tools (Tier A)
  +-- LLM narrative generation (streamed)
  +-- Numeric grounding and safety validation
  +-- AI audit log
  +-- Tier B draft-only transfer tools (Level 3, EPIC-13) — flag-gated, LLM cannot call them directly
```

## UI information architecture (implemented)

The mobile-first UI is a **3-tab MSB banking layout** (`src/components/shell/BottomNav.tsx`): Trang chủ / Tài khoản / PFM. Inside `/pfm`, the IA was first redesigned around MSB's four product-thesis questions as a 4-tab spine (`plans/260909-1519-pfm-benchmark-ia-redesign/`), then reformatted to a **3-tab spine** — Tổng quan / Hũ / Dòng tiền (`plans/260909-2254-pfm-3tab-reformat/`): Hũ was promoted from a Dòng tiền dock to a top-level tab, Dòng tiền became a pure category-chart view (the 3-dock sub-hub retired), and the Kế hoạch/Trợ lý tabs were unmounted (UI only — engine and tests kept). This is a presentation-layer reshuffle only — it does not change the calculation engine, canonical models, or provider contracts below.

```text
src/app/
  page.tsx                 Home ("Trang chủ") — hero header, primary account
                            card, quick actions, promos/insights
  accounts/page.tsx         Tài khoản tab: account list
  accounts/[id]/page.tsx    Account detail: header + scoped transaction list
  transactions/page.tsx     All-transactions view (shared list component)
  pfm/page.tsx              Single PFM route: 3 client-side tabs (Tổng quan /
                            Hũ / Dòng tiền) via PfmTabHost (3-tab reformat,
                            plans/260909-2254-pfm-3tab-reformat/)
  pfm/wealth/page.tsx       Tài sản & Nợ manual manager (WealthManager) — a
                            real page, not a redirect (drill target from
                            Tổng quan and the `open-wealth` copilot intent)
  pfm/cashflow/page.tsx     Redirect -> /pfm?tab=cashflow (legacy deep link)
  pfm/jars/page.tsx         Redirect -> /pfm?tab=hu (legacy deep link; Hũ is
                            now a top-level tab, not a Dòng tiền dock)
  pfm/insights/page.tsx     Redirect -> /assistant (legacy deep link; the old
                            Insights tab is retired, and the Trợ lý tab that
                            once hosted its feed was itself later removed —
                            the feed now surfaces inside the /assistant
                            chat's empty state)
  cashflow/page.tsx         Redirect -> /pfm?tab=cashflow (legacy route kept alive)
  wealth/page.tsx           Redirect -> /pfm?tab=overview (legacy route kept alive;
                            the old Wealth tab no longer exists — see /pfm/wealth
                            above for the manual asset/liability manager)
  settings/page.tsx         Consent scope + revoke, persona switcher, About
  assistant/                AI Assistant chat screen
  transfer-confirm/         Native MSB transfer confirmation (draft handoff)
```

`PfmTabHost` validates `?tab` against the 3-tab enum (`overview` | `hu` | `cashflow`, `src/components/pfm/PfmTabs.tsx`) on every `searchParams` change and falls back to `overview` for a stale/unknown value (e.g. old `?tab=wealth` / `?tab=insights` / `?tab=plan` / `?tab=assistant` bookmarks) — no dead-ends, and the fallback never fights a user's in-session tap (equality-guarded re-sync). It also special-cases the legacy `?tab=cashflow&dock=hu` deep link (from the retired sub-hub), normalizing it to `?tab=hu` via `router.replace` so an old Hũ deep link lands on the Hũ tab, not a dead dock.

Key shared components:

- `src/components/shell/BottomNav.tsx` — 3 tabs (Trang chủ `/`, Tài khoản `/accounts` + `/transactions`, PFM `/pfm`); active-tab matching is prefix-based per tab.
- `src/components/shell/AssistantFab.tsx` — floating action button (Sparkles icon) rendered above the tab bar on every screen except `/assistant`, linking to `/assistant`.
- `src/components/home/*` (`AccountSummaryCard`, `HomeQuickGrid`, `PromoCarousel`, `PromoCard`, `Dots`) — Home-specific presentation, not reused elsewhere.
- `src/components/transactions/TransactionListSection.tsx` — shared transaction list, used by `/transactions` (all accounts, including drill-through from a Dòng tiền category tap) and `/accounts/[id]` (scoped via an `accountId` filter prop). No longer mounted inside `/pfm` — the retired Dòng tiền · Giao dịch dock used to host it there.
- `src/components/pfm/PfmTabHost.tsx` + `src/components/pfm/PfmTabs.tsx` — the single-route `/pfm` tab host: client-side switching (no navigation, no refetch — `useFinancials` loads once), `?tab` re-synced on every change (see above). Tabs (3-tab reformat, `plans/260909-2254-pfm-3tab-reformat/`): **Tổng quan** (`OverviewTab`, no-scroll cockpit), **Hũ** (`HuTab`), **Dòng tiền** (`CashflowChartView`). Only Tổng quan is locked to `overflow-hidden`; the other two scroll within their own region.
- `src/components/pfm/OverviewTab.tsx` + `src/components/pfm/cockpit/*` (`HeroNetWorth`, `StatTile`, `InsightStrip`, `Sparkline`) — the no-scroll "4-Question Cockpit": hero net worth, 2×2 KPI grid (cashflow net, end-of-month estimate, next obligation, runway), top-1 insight strip, a `NetWorthSummary` drill tile (assets/liabilities decomposed from `networth.breakdown`, one tap to `/pfm/wealth`), and a worst-case provenance footer.
- **Hũ tab** (`src/components/pfm/HuTab.tsx`) — the jar partition promoted from a Dòng tiền dock to a top-level tab: its own `PeriodPicker`, `JarList` (reconciliation meter + over-allocated warning + per-jar spend overlay), and an "Điều chỉnh hũ" modal wrapping `JarSetup` (template picker, editor, category assignment); `/pfm/jars` now redirects here.
- **Dòng tiền tab** (`src/components/cashflow/CashflowChartView.tsx`) — replaces the retired 3-dock sub-hub with a pure category-chart view: `PeriodPicker`, jar-filter chips (`groupSpendingByJar`/`jarChipList`), a donut + category bar list (`spendingByCategory`, MoM delta per row, tap-through to `/transactions?category=<id>`), the relocated `CashflowTrendChart` (6-month trend), and a "Xem báo cáo tháng" CTA opening `ReportBriefSheet` (see "Advisory brief" below). The transaction feed itself is not on this tab — it lives at `/transactions` (`TransactionListSection`).
- **Tài sản & Nợ manager** (`src/components/wealth/WealthManager.tsx`, route `/pfm/wealth`) — net-worth strip, editable user-record lists (`AssetEditor` / `LiabilityEditor` bottom sheets), read-only seed section, drop-notice banner. See "Asset and liability module" below for the CRUD/threading contract.
- **Kế hoạch and Trợ lý (unmounted, 3-tab reformat)** — `src/components/plan/PlanTab.tsx` (`GoalList` + `GoalEditor` + `GoalProjectionCard` for goal CRUD/what-if, `SurplusPanel`, `HealthPanel`) and `src/components/assistant/AssistantTab.tsx` (copilot entry Link + `SuggestedPrompts` + `InsightsView`) still exist as components, each carrying a `// DEFERRED:` header comment, but neither is referenced by `PfmTabHost` anymore — this is a UI-unmount only, the goal/health/surplus engine and the AI facade are unaffected. The rule-based insights feed they used to host now renders inline inside the `/assistant` chat's empty state (`ChatPanel.tsx`). See "Goals module" below for the untouched CRUD/threading contract.
- `src/components/charts/CashflowTrendChart.tsx` — multi-month income/expense/net chart, now rendered on the Dòng tiền tab, fed by `cashflowTrend()`.
- `src/components/wealth/HealthPanel.tsx` — 2×2 financial-health panel (runway, surplus, essential-expense coverage, asset concentration), fed by the composed `Financials.health`; currently unmounted along with `PlanTab` (see above).
- `src/components/insights/InsightFilters.tsx` — severity filter (info / attention / urgent), now rendered inside the `/assistant` chat's empty-state insights feed (`InsightsView` in `ChatPanel.tsx`).
- `src/components/primitives/ProvenanceChip.tsx` — thin wrapper over `SourceBadge` (+ optional freshness); one shared place for provenance styling (invariant #5), used across the Tổng quan and Wealth surfaces (also referenced by the currently-unmounted Kế hoạch components).
- `src/components/states/UnknownValue.tsx` — renders `—` / "Chưa xác định", never `0₫` (invariant #6).
- `src/lib/format.ts` (`maskAccountNumber`) — masks an account number to its last 4 digits for display (e.g. `•••• 1991`); used by the Home account card and account list/detail headers. Presentation-only; does not touch the calculation engine or provider data.
- `src/lib/transfer-draft-store.ts` — session-scoped (`sessionStorage`) hand-off of a `TransferDraft`'s display fields (name, masked account, amount, memo, source label) from the chat `DraftCard` to `/transfer-confirm`, keyed by draft id. The draft's PII/financial fields never travel in the URL query string — only the `draftId` does. No account number (only the masked form) is ever stored, and nothing in this module executes a transfer; it purely carries display state across the client-side navigation boundary, consistent with the `TransferDraft` model and pipeline in "Tier B — draft-only tools" below.
- `src/lib/copilot-nav.ts` (`resolveIntentRoute`) — see "Copilot universal jump" below.
- `src/lib/persona-storage.ts` (`personaLocalStorageResource<T>()`) — see "Shared user-record CRUD infrastructure" below.

### Copilot universal jump (implemented)

`src/lib/copilot-nav.ts` — `resolveIntentRoute(intent)` is a **static code whitelist**, not an LLM navigation authority (invariant #2): the intent id is a strict enum and every route is a fixed literal with no free-text interpolation (no per-intent params anymore — the 3-tab reformat retired the Dòng tiền sub-hub docks, so there is no `dock` param left to smuggle a path through); any unknown intent falls back to `/pfm` (never a dead-end, never an injected route). Intents: `open-overview`, `open-cashflow`, `open-hu`, `open-transactions`, `open-report`, `open-wealth`, `open-assistant`. The former `open-plan` intent was removed along with the Kế hoạch tab; any CTA that used to open it now points at `open-hu` instead. It is the single source of truth consumed by the Assistant FAB, `SuggestedPrompts`, and the advisory brief's "nên làm gì" CTAs — all three render it as a **tappable `Link`**, never an auto-navigation, so an LLM-originated suggestion can only ever produce a link the user chooses to follow.

### Advisory brief — Báo cáo tư vấn (implemented, deterministic)

`src/insights/brief.ts` (`composeMonthlyBrief`) + `src/insights/advisory-copy.ts` compose a **deterministic, templated** monthly brief from the same rule-based detectors (`runDetectors`) and cashflow facts the rest of the app uses — no LLM, no network call, grounding by construction. Output: `positives[]`, `risks[]`, `highlights[]` (each with evidence, a magnitude band, templated "nghĩa là gì" / "nên làm gì" copy, and a whitelisted `resolveIntentRoute` CTA), and a deduped `actions[]` list. Insufficient-data months return an honest empty message and zero actions; data-rich but detector-quiet months get one grounded fallback CTA derived from `cashflow.net` (never a fabricated action). Rendered by `src/components/insights/AdvisoryReport.tsx` (loading/error/insufficient/empty states) inside `src/components/cashflow/ReportBriefSheet.tsx`, a bottom sheet opened from the "Xem báo cáo tháng" CTA on the Dòng tiền tab (the former dedicated Báo cáo dock is retired along with the rest of the sub-hub). **LLM narration of this brief was scoped for this redesign but deferred** (red-team: injection/timeout/pipeline-shape risk not worth taking before the new IA is validated) — see EPIC-07/PFM-062 in `plans/project-backlog.md`.

### Shared user-record CRUD infrastructure (implemented)

Jars pioneered a "load / save / schema-guard / reseed" pattern for user-editable state; `src/lib/persona-storage.ts` (`personaLocalStorageResource<T>()`) generalizes it into one shared helper so assets/liabilities and goals don't re-derive persona keys, SSR guards, and try/catch:

- Persona-scoped key (`msb-pfm.{namespace}.{personaId}`) — one persona's records never leak into another.
- Schema-guarded read (`guard: (value: unknown) => value is T`); missing/corrupt/foreign-shape data falls back to a deep-cloned `seed()`, never a throw.
- `load` / `read` / `save` / `clear` / `reseed`, all storage I/O wrapped in try/catch (private mode, quota, SSR all degrade gracefully).

The mock provider builds a generic `userRecordStore<T>()` on top of this helper (`src/providers/mock/mock-provider.ts`), reused verbatim by assets, liabilities, and goals. Each record type adds its own **per-record guard** (`isValidAssetRecord` / `isValidLiabilityRecord` / `isValidGoalRecord`) inside a versioned store envelope (`UserRecordStore<T>`, e.g. `ASSET_STORE_VERSION`), so one corrupt record is dropped (counted, surfaced as a dismissible drop-notice) without wiping the whole store. Each CRUD context (`AssetLiabilityProvider` in `src/state/assets.tsx`, `GoalProvider` in `src/state/goals.tsx`) does a **synchronous reset-to-seed before the async load** on persona switch, so a persona change never flashes the previous persona's records.

## Module responsibilities

### Transaction module

- Ingest normalized transactions.
- Deduplicate and classify transfer/refund/reversal states.
- Store category and merchant corrections.
- Detect recurring patterns.
- Expose transaction queries to other modules.

### Cash-flow module

- Aggregate income and expense by time period.
- Exclude internal transfers from cash-flow totals.
- Separate fixed and discretionary spending.
- Calculate period comparisons and end-of-period estimates.
- Build a multi-month trend for charting (`cashflow-trend.ts`), flagging months with no underlying data so the UI renders a gap rather than a misleading 0.
- Project end-of-month liquid cash and cash-runway months (`projection.ts`) — always `source: "estimated"`, and only computed for the current month; other months are `"unknown"`.
- Partition the current primary-account balance into user-defined spending jars, with an informational spend overlay (`jars.ts` — `evaluateJarPartition`); config persists per persona and has a dedicated setup UI. See "Spending jars" below.

### Balance-sheet module

- Aggregate assets and liabilities.
- Calculate net worth and net-worth trend (`networth.ts` — `calculateNetWorth`, `networthTrend`), exposing the raw current/previous values plus a sparkline series and lowest-trust provenance.
- Compute explainable financial-health indicators (`health.ts` — runway, surplus, essential-expense coverage, asset concentration), each `null` rather than defaulted when its inputs are missing. Composed exactly once per `computeFinancials` call (`Financials.health`) and reused by every consumer (Tổng quan's Sức khỏe tile; `HealthPanel`, currently unmounted with the rest of the Kế hoạch tab) instead of each screen recomputing it.
- Keep source and freshness metadata.
- Distinguish verified, self-reported, and estimated values.

### Spending jars (Hũ chi tiêu) — implemented, Model A (snapshot partition)

**Model A supersedes an earlier monthly spending-envelope design** (allocation as % of income, "used" = period spend vs allocation, income-basis resolution; drafted in `plans/260908-1311-spending-jars`) — that design was never shipped. The shipped model is a **display-only snapshot partition of the current primary-account balance**: a jar earmarks a share of the balance, it never holds or moves money, and it has no income basis and no clock.

`evaluateJarPartition(config, primary, txns, period, prevPeriod)` (`src/domain/engine/jars.ts`) is the whole engine:

- **Primary-account resolution.** `resolvePrimaryAccount(accounts)` returns the single `type: "current"` account, or `null` when there are zero or two-or-more — an intentionally ambiguous balance is never guessed (invariant #6). `evaluateJarPartition` on `null` returns `{ status: "unknown", primaryBalance: null, lines: [] }`, never a fabricated or zeroed partition.
- **Earmark resolution.** `resolveAllocation(jar, primaryBalance)` = `round(balance * percent / 100)` for `mode: "percent"`, or `round(value)` for `mode: "amount"`. Resolved fresh against the live balance on every evaluation — a jar carries no stored balance of its own.
- **Residual-by-construction identity (invariant #1).** The explicit jar earmarks are summed; the residual `"Chưa phân bổ"` line takes `balance − Σ earmarks`, which also absorbs the whole-VND rounding remainder, so `Σ(lines.earmark) === primaryBalance` holds exactly. `assertPartitionBalances` is a dev-only (no-op in production) console guard that would flag a broken identity in tests. A negative residual means the jars were over-allocated (`Σ chia > số dư`), surfaced as `isOverAllocated` — a warning, not an error.
- **Spend overlay, never a second ledger.** `spentThisPeriod` / `spentPrevPeriod` per jar are `netExpenseByCategory` (`cashflow.ts`) over the jar's categories for the selected and previous period (transfers excluded, refunds reversed, reversed dropped, pending kept separate) — informational only; the overlay never feeds back into the earmark or the identity. `isOverBudget = spentThisPeriod > earmark` is the jar's only budget signal — "chia" doubles as the monthly spending reference, so there is no separate budget-vs-jar distinction to maintain.
- **Provenance is split, not folded uniformly (invariant #5):** an explicit jar's `meta` folds the lowest-trust source and oldest freshness over its feeding spend transactions (`foldSpendProvenance`); the residual line has no feeding transactions, so its `meta` carries the primary account's **own** `source`/`lastSyncedAt` directly.
- **Input validation:** `validateJarInput(raw, mode)` is the sole gate between the free-text setup field and `JarAllocation.value` — rejects blank/non-finite/negative, and caps a percent at 100, so `NaN`/`Infinity`/negative values can never reach the engine.
- `JarConfig` (`version: 2`, `src/domain/models/index.ts`), `Jar`, `JarAllocation` are **user state**, not provider `RawData` — threaded into the engine via `ComposeOptions.jarConfig` (`finance-compose.ts`). `Financials` carries `jarPartition: JarPartitionResult` (replacing the earlier `jarLines`/`jarIncomeBasis` fields, which no longer exist).
- **Templates:** `src/domain/models/jar-defaults.ts` defines three pickable templates (`JAR_TEMPLATE_LIST`) — Cá nhân (6 hũ, `DEFAULT_JAR_CONFIG`), Gia đình (4 hũ), Kinh doanh (3 hũ) — each a static literal whose percents sum to ≤100 so applying one can never start over-allocated, and with one-category-one-jar already enforced. `configFromTemplate` builds a fresh `version: 2` config; applying a template replaces the whole jar set.
- **Persistence:** `Providers.getJarConfig()` / `saveJarConfig()` (`src/providers/interfaces.ts`) remain the only *write* methods on `Providers`. The mock adapter (`src/providers/mock/mock-provider.ts`) backs them with persona-scoped `localStorage` (key `msb-pfm.jars.<personaId>`) plus a structural schema guard (`isValidJarConfig`: `version === 2` + shape checks); a missing, corrupt, wrong-shape, or **stored-v1** record reads back as `null`/is discarded, so the caller reseeds from `DEFAULT_JAR_CONFIG` — the v1→v2 model change is a hard cutover, not a field migration, since v1's income-basis/anchor concepts have no v2 equivalent (accepted data loss in the prototype's localStorage-backed persistence). A real adapter maps these two methods to the MSB preferences API (invariant #4) without changing the interface.
- **`JarConfigProvider` context (`src/state/jars.tsx`):** loads the config through the provider seam on mount and on persona switch (`migrateJarConfig` discards any `version !== 2` record and reseeds), normalizes overlapping categories on load, enforces one-category-one-jar on every mutation (`stripCategories`), and persists each mutation back through `saveJarConfig`. Exposes `applyTemplate` for the template picker. `useFinancials` threads the live `config` into `computeFinancials` via `ComposeOptions.jarConfig`.
- **UI (`src/components/jars/`, `src/components/pfm/HuTab.tsx`):** `JarCard` renders one explicit jar as **chia** (earmark) vs **đã tiêu kỳ này** (spend overlay) with a MoM delta and a "Vượt ngân sách" warning when over; `JarList` renders these inside `HuTab` (the top-level Hũ tab — promoted out of the retired Dòng tiền sub-hub in the 3-tab reformat, see the IA section above) — the residual "Chưa phân bổ" line is never rendered as a jar card, only inside the reconciliation meter. `JarSetup` (template picker + `AllocationMeter` reconciliation meter + `JarEditor` + `CategoryAssigner`) opens as a tab-scoped "Điều chỉnh hũ" modal from `HuTab`; `SurplusPanel` was relocated out of `JarSetup` to the Kế hoạch tab (`PlanTab`) in the earlier IA redesign, and `PlanTab` itself is now unmounted (3-tab reformat — see "Key shared components" above). `src/app/pfm/jars/page.tsx` is now a thin `redirect("/pfm?tab=hu")` for legacy links. `src/components/budget/PressureRow.tsx` is still the shared row primitive reused by `JarCard`.
- **Insight:** `src/insights/detectors/jar-pressure.ts` returns one of two non-blocking warnings, in priority order — (1) over-allocated residual (`Σ chia > số dư`), or (2) the most-breached jar (`đã tiêu > chia`) — and only fires for the current month, off `jarPartition.status !== "ok"`.
- **Level 3 surplus allocation (`src/domain/engine/surplus.ts`):** `surplusFromResidual(residual)` = `residual === "unknown" ? "unknown" : max(0, residual)` — the surplus **is** the "Chưa phân bổ" residual (a stock already net of every earmark), not `income − expense`; it must not subtract expense again, since the residual was never income-derived. `simulateSurplusAllocation({ surplus, goals, split })` is unchanged: a pure, read-only what-if that distributes the surplus across goals per a UI-supplied split, capping each target at the goal's remaining headroom and the surplus left — it never mutates a goal, moves money, or produces a transfer draft. An unknown primary balance yields `surplus: "unknown"`, never `0`. Rendered by `SurplusPanel` (`src/components/jars/SurplusPanel.tsx`), which lives on `PlanTab` — currently unmounted along with the rest of the Kế hoạch tab (3-tab reformat; engine untouched), reading the merged `financials.goals`.
- **Legacy Budget (dormant):** the flat per-category `Budget`/`evaluateBudget` (`src/domain/engine/budget.ts`) remains wired into `Financials.budgetLines` but is not surfaced in any screen alongside Hũ — Hũ is the only budgeting concept presented to the user. `pressure.ts` (`NEAR_THRESHOLD`, `statusOf`, `daysLeftIn`) still backs the legacy Budget's ok/near/over classification but is not used by the jar partition, which has its own boolean `isOverBudget`.

### Asset and liability module

- Manage manually declared assets and debts.
- Store valuation timestamp and confidence.
- Track debt terms and upcoming obligations.
- **CRUD (implemented, `/pfm/wealth`):** `Providers.getUserAssets` / `getUserLiabilities` (return `{records, dropped}`) plus `create/update/deleteAsset` and `create/update/deleteLiability` (`src/providers/interfaces.ts`), backed by the shared `userRecordStore<T>()`. These are **persistence-only** — `listAssets()` / `listLiabilities()` stay **seed-only** and are never also merged in the provider layer. The single merge point is `ComposeOptions.userAssets` / `userLiabilities` in `finance-compose.ts`: user records are context state (`AssetLiabilityProvider`) threaded into `computeFinancials`'s `useMemo` deps, merged with seed data for `calculateNetWorth` and `upcomingObligations` exactly once — so a mutation recomputes net worth/debt health live, with no double-count. New self-reported records carry `source: "self_reported"`; a blank valuation stays `null` (`UnknownValue`), never `0`. Validation (`src/domain/models/asset-liability-input.ts`) is the sole gate between the form and a committed record: blank/NaN/negative/over-cap and enum-checked types are blocked client-side before they can reach storage.

### Goals module

- Store target, deadline, current funding, priority, and contribution.
- Calculate required periodic contribution.
- Run deterministic completion scenarios.
- **CRUD (engine + provider implemented; Kế hoạch tab UI currently unmounted, 3-tab reformat):** mirrors the asset/liability pattern exactly. `GoalDataProvider` (`listGoals` seed-only + `getUserGoals` + `create/update/deleteGoal`) is backed by the same `userRecordStore<GoalRecord>()`; `GoalProvider` (`src/state/goals.tsx`) is the context, `ComposeOptions.userGoals` is the single merge point (`Financials.goals = [...raw.goals, ...userGoals]`), and `useFinancials` threads it into the `useMemo` deps for live recompute. `GoalProjectionCard` exposes a direct-tap `simulateGoal` what-if (live monthly-contribution slider); a parity test (`goal-parity.test.ts`) asserts the chat tool's `simulateGoal` call returns the identical projection as the direct-tap UI (invariant #1).

### Insight module

- Run rule-based insight detectors.
- Persist insight facts and comparison period.
- Ask AI to produce a human-readable explanation.
- Support dismiss, snooze, and helpfulness feedback.

### Recommendation module

- Apply eligibility, risk, liquidity, and goal constraints.
- Rank scenarios or mock products with explicit reason codes.
- Keep recommendation policy separate from LLM wording.

## Canonical data model

### Transaction

```text
id
accountId
postedAt
amount
currency
direction: credit | debit
type: income | expense | transfer | refund | fee | card_payment
merchantName
merchantNormalizedName
categoryId
status: pending | posted | refunded | reversed
source
isRecurring
userEdited
```

### Account

```text
id
type: current | savings | credit_card
institution
currency
balance
availableBalance
lastSyncedAt
source
tier?            # display-only membership tier (e.g. "M-FIRST GOLD"); marketing
                 # metadata, source: mock, never read by the calculation engine;
                 # absent for accounts with no tier
maskedNumber     # display-safe account number, already masked to the last 4
                 # digits (e.g. "•••• 1991"); the full number is never carried
                 # on this UI-facing model; presentation-only, provenance
                 # follows `source`
```

### Asset

```text
id
type: cash | deposit | fund | stock | gold | real_estate | vehicle | other
name
value
currency
source: msb | self_reported | mock
lastUpdatedAt
isEstimated
```

### Liability

```text
id
type: credit_card | personal_loan | mortgage | instalment | other
name
outstandingPrincipal
interestRate
minimumPayment
dueDate
remainingTerm
source
lastUpdatedAt
```

### Insight

```text
id
type
severity: info | attention | urgent
title
explanation
sourceFacts[]
comparisonPeriod
generatedAt
confidence
assumptions[]
actionType
status
```

### TransferDraft

An agent-prepared draft. It is an intent to be reviewed, never an executed transaction.

```text
id
status: draft            # only ever "draft" from the agent; execution happens outside the facade
recipientRef             # reference to a saved beneficiary / history record; never a fabricated number
recipientName
recipientAccountMasked   # masked for display
recipientSource: saved_beneficiary | user_typed | transaction_history
sourceAccountId
amount
currency
memo
riskFlags[]              # e.g. new_payee, over_threshold, urgency_language
thresholdHit: boolean
requiresReconfirm: boolean
createdBy: agent
createdAt
requestId
```

The agent never populates OTP, credentials, or an execution token. `recipientAccountMasked` and `recipientRef` always trace to an existing record.

### Consent and audit

Every data scope and AI response should be attributable to:

```text
userId
consentVersion
dataScope
purpose
createdAt
revokedAt
requestId
```

## Provider abstraction

PFM features depend on interfaces, not data-source implementations:

```text
AccountDataProvider
TransactionDataProvider
AssetDataProvider
LiabilityDataProvider
MarketDataProvider
BeneficiaryDataProvider  # saved payees for Tier B recipient resolution (findRecipient)
```

The mock provider supplies deterministic fixtures for the prototype. Production providers can later connect to MSB core banking, card, savings, or investment systems without changing calculation and presentation contracts.

The composed `Providers` bundle (`src/providers/interfaces.ts`) also exposes the write methods `getJarConfig()`/`saveJarConfig()` (Hũ) and the CRUD pairs for user assets, liabilities, and goals (`getUserAssets`/`create·update·deleteAsset`, `getUserLiabilities`/`create·update·deleteLiability`, `getUserGoals`/`create·update·deleteGoal`) — all persistence-only, all backed by the mock adapter's shared `userRecordStore<T>()` (persona-scoped `localStorage`, versioned envelope, per-record guard). See "Spending jars" above and "Shared user-record CRUD infrastructure" in the IA section for the persistence strategy and the intended real-adapter mapping.

## Financial calculation rules

The calculation engine is pure and independently testable.

Required rules:

- Internal transfers do not count as income or expense.
- Refunds reverse the appropriate expense category.
- Reversed transactions are excluded from final totals.
- Pending transactions are separated from posted totals.
- Net worth equals assets minus liabilities.
- Missing values remain unknown; they are not silently defaulted to zero.
- Every aggregate exposes its period, source coverage, and freshness.

## AI facade

**Status:** the facade is implemented and live, not a stub. Tier A (read-only analytics + deterministic simulation) is wired to a real LLM with an offline fallback. Tier B (draft-only transfer tools, Level 3, `EPIC-13`, `plans/project-backlog.md`) is also implemented: the agent can prepare a `TransferDraft`, gated by the `ENABLE_TRANSFER_DRAFTING` feature flag (default ON in the prototype). The agent still never executes, confirms, or authenticates a transfer — that stays with the human in the native MSB confirm flow. When the flag is off, transfer-intent messages fall back to the original hard refusal (no draft, no tool call).

The AI facade is an application boundary, not a domain module. It cannot mutate the ledger.

### LLM provider layer (implemented)

- `src/ai/llm/types.ts` — provider-neutral `LlmClient` / `LlmMessage` / `LlmTool` / `LlmStreamEvent` contract. The pipeline depends only on this; adding a provider means writing one adapter, not touching the pipeline.
- `src/ai/llm/anthropic-client.ts` — default adapter. Maps the neutral message/tool shapes to the Anthropic Messages API (model `claude-sonnet-5` by default, overridable via `LLM_MODEL`) and normalizes its stream back to `LlmStreamEvent`.
- `src/ai/llm/index.ts` (`getLlmClient()`) — selects a provider from `LLM_PROVIDER` (see `.env.example`; default `anthropic`, `none`/`off` forces offline mode). Returns `null` — not an error — when no API key is configured, so the app always builds and runs without one.
- The module is `server-only`; importing it from a client component is a build error, so the API key never reaches the browser bundle.
- **Offline fallback** (`src/ai/pipeline/fallback.ts`): when `getLlmClient()` returns `null` or a live call throws, the pipeline degrades to the original templated answers (`src/insights/assistant.ts`, the former "3 fixed prompts" logic) and marks the response `degraded: true`. The assistant therefore always answers something, with or without a configured key.

### Calculation reuse (implemented)

`computeFinancials` was extracted from the React data hook into `src/domain/engine/finance-compose.ts` so the server-side AI pipeline calls the **same deterministic engine** the UI renders from — the AI never becomes a second source of financial truth (invariant #1). Its `Financials` return type also backs the PFM Overview cockpit (`src/components/pfm/OverviewTab.tsx`), with `endOfMonth` (`EndOfMonthEstimate`) and `runway` (`CashRunway`) computed only for the current month and `networthCurrent`/`networthPrevious`/`networthSeries`/`networthSeriesMeta` derived from `networthTrend()`. Two new pure simulation engines back the what-if tools:

- `src/domain/engine/goals.ts` — `simulateGoal`
- `src/domain/engine/debt.ts` — `simulateDebtRepayment`

### Tier A — read-only tools (implemented)

Six whitelisted tools, registered in `src/ai/tools/registry.ts` as the *only* tool set the LLM may call (`src/ai/tools/read-tools.ts`, `src/ai/tools/sim-tools.ts`):

- `getMonthlyCashflow(period?)`
- `getSpendingByCategory(period?, topN?)`
- `getUpcomingObligations(horizonDays?)`
- `calculateNetWorth()`
- `simulateGoal(goalId?, monthlyContribution?)`
- `simulateDebtRepayment(liabilityId?, monthlyPayment?)`

Each handler is pure: it reads from the deterministic engine, never computes inline, and attaches a Vietnamese `sources[]` string plus `period` used for the response's provenance chips.

### Tier B — draft-only tools (implemented, `src/ai/tools/draft-tools.ts`)

Level 3 assisted transfer drafting (`EPIC-13`). Tier B is **deliberately excluded** from `toolSchemas()` (`src/ai/tools/registry.ts`) — the LLM tool-use loop only ever sees Tier A. The action pipeline (`src/ai/pipeline/action-pipeline.ts`) calls Tier B directly, server-side, with fields parsed from the user's text in code (`src/ai/pipeline/action-parse.ts`), never by the model — so a prompt-injected model cannot fill transfer fields or trigger a draft on its own.

- `findRecipient(query, ctx)` — resolves a payee from saved beneficiaries (`BeneficiaryDataProvider`) or the user's transaction history only; returns real, existing account references (masked for display) or an honest "not found"/"ambiguous" result. Never fabricates an account number.
- `prepareTransferDraft(input, ctx)` — validates recipient/amount/source account and returns a `TransferDraft`. It does **not** submit, confirm, or execute anything; there is no execute/confirm/authenticate/OTP path anywhere in this module.

Feature-gated by `isTransferDraftingEnabled()` (`src/ai/config.ts`, env `ENABLE_TRANSFER_DRAFTING`, default ON in the prototype). Turning it off restores the prior hard refusal; it can never grant execution capability. Tier B produces a draft object plus a handoff to the native MSB confirmation screen (`src/app/transfer-confirm/`), which the facade cannot invoke. See the `TransferDraft` model above and the action pipeline below.

### Request pipeline (implemented — `src/ai/pipeline/orchestrator.ts`, `runAssistant`)

```text
User message
  -> classifyIntent (intent.ts — keyword rules, no second LLM round-trip)
  -> ensureScopes (scope-check.ts — consent scopes granted by the client; always requires "ai")
  -> action_transfer intent? -> refuse with a fixed Vietnamese message (no Tier B yet)
  -> checkRequiredData (required-data.ts — e.g. no goals -> ask instead of guessing)
  -> no configured LLM client? -> offline fallback (fallback.ts)
  -> LLM tool-use loop (system-prompt.ts + Tier A tool schemas, up to 4 steps):
       model requests a tool -> server executes the handler -> result streamed back -> repeat until a final text turn
  -> validateSafety + validateNumeric (validator.ts)
  -> stream text/tool/chart/done events, or degrade to the offline template on LLM error
  -> AI audit event recorded (audit/log.ts) in a `finally` block regardless of outcome
```

Grounding and safety are enforced in code, not just by prompt:

- `validateNumeric` requires every monetary figure in the final narrative to trace back to a number returned by a tool call (tight ~1% band, or an exact rounded form such as nearest 1k/100k/1M). Anything ungrounded causes the answer to be replaced with a safe "not sure" reply instead of being shown.
- `validateSafety` blocks guaranteed-return language and any claim that the assistant already performed a transfer or payment (the facade can never move money, so it can never truthfully say it did).
- The system prompt (`system-prompt.ts`) instructs the model that tool-result content (transaction/merchant/category labels) is data, not instructions — a prompt-injection guard, since transaction descriptions are user- or merchant-controlled text.

### Streaming chat UI (implemented)

- `POST /api/assistant` (`src/app/api/assistant/route.ts`) — Node runtime (required for the SDK and server env), streams NDJSON `AssistantEvent`s (`text`, `tool`, `chart`, `refusal`, `degraded`, `error`, `done`; see `src/ai/pipeline/events.ts`).
- `src/lib/assistant-stream.ts` — client-side NDJSON reader; no API key ever reaches this layer.
- `src/components/assistant/` — `ChatPanel`, `ChatMessage`, `Composer`, `SourceChips` (renders the `sources`/`period` provenance per message), `WhatIfChart` (renders the goal/debt simulation series built by `whatif-chart.ts`).

### Proactive openers and audit (implemented)

- `src/ai/proactive/openers.ts` — reuses the existing rule-based insight detectors to seed the chat with the single highest-severity insight; bounded (at most one opener), no new autonomy introduced.
- `src/ai/audit/` — an audit event per request (`AiAuditEvent`: `requestId`, `consentVersion`, `dataScope`, `intent`, `toolsUsed`, `validation` flags, `degraded`). Metadata only — never the raw prompt, PII, account numbers, or credentials.

### Action pipeline (assisted transfer drafting) — implemented (`src/ai/pipeline/action-pipeline.ts`)

```text
User asks to send money
  -> intent classification (action_transfer intent, or a re-confirmation reply)
  -> consent/scope check (same ensureScopes as Tier A; always requires "ai")
  -> feature flag off? -> fixed hard refusal (no draft, no tool call)
  -> parse fields deterministically from text (action-parse.ts) — never by the LLM
  -> resolve recipient via findRecipient (saved / typed / history; never fabricated)
  -> gather + validate required fields (recipient, amount, memo, source account)
  -> risk checks: amount threshold (10M VND) + fraud heuristic (new payee + large + urgency)
  -> if risky/over-threshold: in-chat re-confirmation before drafting (stops the turn)
  -> prepareTransferDraft (Tier B) -> TransferDraft
  -> render editable draft + provenance in chat
  -> handoff to native MSB confirm screen (src/app/transfer-confirm/, prefilled, all fields editable)
  -> HUMAN reviews every field -> confirms -> enters OTP/password (simulated, user-operated)
  -> MSB flow (outside the facade) executes
  -> AI audit log records the draft (fields/risk flags/outcome only, no credentials/OTP)
```

The agent's authority ends at the `TransferDraft`: execution, confirmation, and authentication are performed only by the human in the MSB confirm flow, which the facade cannot invoke — this stays true whether or not the drafting flag is enabled. When `ENABLE_TRANSFER_DRAFTING` is off, the orchestrator (`src/ai/pipeline/orchestrator.ts`) stops at the first line and any `action_transfer` intent is refused before any tool call, matching the pre-EPIC-13 behaviour.

### AI response contract

Each answer includes, where relevant:

- Answer text (streamed).
- Data period and source (`SourceChips`, from each tool result's `sources[]`/`period`).
- Assumptions (stated in the tool `sources[]` text, e.g. "dự phóng theo giả định đóng góp đều").
- A safe refusal instead of a guess when data is missing (`required-data.ts`) or a numeric/safety check fails (`validator.ts`).

The LLM cannot directly mutate financial records or call transaction execution/authentication APIs. It can, via the deterministic action pipeline (not via a tool call the model makes itself), cause an `action_transfer` intent to return a `TransferDraft` plus a handoff descriptor — but that is the limit of its authority: the execute/confirm/OTP step remains performed by the human in the native MSB flow, which the facade cannot invoke.

## Data flow: mock to production

```text
Synthetic fixtures
  -> mock provider
  -> canonical models
  -> calculation engine
  -> UI and AI context

Future:

MSB systems
  -> integration adapter
  -> canonical models
  -> same calculation engine
  -> same UI and AI contracts
```

## Security, privacy, and trust

- Granular consent for transaction, asset, liability, and AI usage.
- Least-privilege access to PFM data.
- PII minimization in prompts and logs.
- Merchant and account identifiers masked where not needed.
- Prompt/output audit without storing unnecessary sensitive content.
- User-visible source and last-sync timestamp.
- Explicit separation between verified MSB data and self-reported data.
- No autonomous money movement: the agent may prepare a transfer draft (Tier B, flag-gated by `ENABLE_TRANSFER_DRAFTING`), but execution, confirmation, and OTP/authentication remain performed only by the human in the native MSB confirm flow; the facade has no execution/authentication capability and never handles credentials or OTP. With the flag off, every transfer-intent request is refused outright.
- Recipient account numbers are never fabricated by the agent; they resolve only from saved beneficiaries, explicit user input, or existing transaction history.
- Draft creation is audited (fields, recipient source, risk flags, threshold hits) without storing credentials or OTP.
- Production rollout requires security, privacy, compliance, and model-risk review.

## Observability

Track:

- Data sync success and freshness.
- Categorization confidence and correction rate.
- Calculation errors.
- AI tool-call errors and latency.
- Grounding validation failures.
- Helpful/not-helpful feedback.
- Recommendation dismissal and escalation.

## Testing strategy

- Unit tests for every financial calculation rule.
- Fixture-based reconciliation tests for totals and net worth.
- Contract tests for provider adapters.
- Golden tests for AI numeric grounding (implemented — `src/ai/pipeline/__tests__/grounding.test.ts`, `validator.test.ts`, `safety.test.ts`, `orchestrator.test.ts`).
- Safety tests for unsupported advice and action requests (implemented — transfer intents are asserted to be refused when the drafting flag is off).
- Draft-safety tests (implemented — `src/ai/tools/__tests__/draft-tools.test.ts`, `src/ai/pipeline/__tests__/action-pipeline.test.ts`, `action-parse.test.ts`, `draft-attack.test.ts`): agent never executes/confirms, never fabricates a recipient account number, honours the amount threshold, and triggers the fraud checkpoint on new-payee + large + urgency.
- Accessibility tests for charts, colour, labels, and keyboard navigation.
- End-to-end tests for onboarding, correction, goal creation, and simulation.

## Evolution path

### Prototype

- One deployable application.
- Mock provider.
- Local or development database.
- Rule-based insight detectors plus constrained LLM narrative.

### Pilot

- Real read-only MSB data adapters.
- Consent service.
- Centralized observability.
- Feature flags by PFM level.

### Production

- Separate high-volume ingestion if needed.
- Model gateway and evaluation pipeline.
- Recommendation policy service.
- Human/advisor handoff.
- Formal privacy, security, compliance, and operational controls.

## Architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deployment shape | Modular monolith first | Lowest complexity for prototype, preserves boundaries |
| Financial truth | Deterministic engine | Numeric correctness and auditability |
| AI role | Non-committing facade, two tool tiers (read + draft); both Tier A (read/simulate) and Tier B (draft, Level 3) implemented | Explainability and safety; agent explains/simulates and prepares transfer drafts, but never executes |
| Data integration | Provider interfaces | Mock now, MSB systems later |
| Agent topology | Single assistant with tools | Avoid premature multi-agent complexity |
| Level rollout | Progressive gates | Build trust and data coverage before advice |
