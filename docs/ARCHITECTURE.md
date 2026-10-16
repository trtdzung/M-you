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

The mobile-first UI is a **3-tab MSB banking layout** (`src/components/shell/BottomNav.tsx`): Trang chủ / Tài khoản / PFM. Inside `/pfm`, the IA has been redesigned twice: first around MSB's four product-thesis questions as a 4-tab top-tab spine (`plans/260909-1519-pfm-benchmark-ia-redesign/`), then to a 3-tab spine — Tổng quan / Hũ / Dòng tiền (`plans/260909-2254-pfm-3tab-reformat/`) — and now to a **BIDV-style wallet layout**: a 4-tab bottom nav (Tổng quan · Giao dịch · Ngân sách · Cài đặt) with a center add-transaction FAB, plus a substantially redefined Hũ model (`plans/260910-1626-pfm-bidv-wallet-reformat/`, the shipped state). This latest reformat **is not purely presentational** — unlike the two earlier tab reshuffles, it also changed the Hũ domain model (a jar is now a category group with an optional monthly limit, not a balance-share partition) and retired one insight detector; see "Spending jars" below for the model change and "Financial calculation rules" for what stayed the same.

```text
src/app/
  page.tsx                 Home ("Trang chủ") — hero header, primary account
                            card, quick actions, promos/insights
  accounts/page.tsx         Tài khoản tab: account list
  accounts/[id]/page.tsx    Account detail: header + scoped transaction list
  transactions/page.tsx     All-transactions view (shared list component)
  pfm/page.tsx              Single PFM route: first-run onboarding, else the
                            4-tab wallet host (Tổng quan / Giao dịch / Ngân
                            sách / Cài đặt) via PfmTabHost (BIDV wallet
                            reformat, plans/260910-1626-pfm-bidv-wallet-reformat/)
  pfm/wealth/page.tsx       Tài sản & Nợ manual manager (WealthManager) — a
                            real page, not a redirect (drill target from
                            Tổng quan and the `open-wealth` copilot intent)
  pfm/cashflow/page.tsx     Redirect -> /pfm?tab=cashflow (legacy deep link;
                            `?tab=cashflow` itself now normalizes to `overview`)
  pfm/jars/page.tsx         Redirect -> /pfm?tab=hu (legacy deep link; `hu`
                            normalizes forward to the `budget` tab)
  pfm/insights/page.tsx     Redirect -> /assistant (legacy deep link; the old
                            Insights tab is retired, and the Trợ lý tab that
                            once hosted its feed was itself later removed —
                            the feed now surfaces inside the /assistant
                            chat's empty state)
  cashflow/page.tsx         Redirect -> /pfm?tab=cashflow (legacy route kept alive)
  wealth/page.tsx           Redirect -> /pfm?tab=overview (legacy route kept alive;
                            the old Wealth tab no longer exists — see /pfm/wealth
                            above for the manual asset/liability manager)
  settings/page.tsx         App-level Settings: consent scope + revoke, persona
                            switcher, About. Distinct from the PFM "Cài đặt"
                            wallet tab below, which only manages hũ/categories.
  assistant/                AI Assistant chat screen
  transfer-confirm/         Native MSB transfer confirmation (draft handoff)
```

`PfmTabHost` validates `?tab` against the 4-tab enum (`overview` | `transactions` | `budget` | `settings`, `src/components/pfm/PfmTabs.tsx`) on every `searchParams` change and falls back to `overview` for a stale/unknown value — no dead-ends, and the fallback never fights a user's in-session tap (equality-guarded re-sync). Legacy ids from the earlier 3-tab IA resolve forward (`resolveLegacyTab`: `hu` → `budget`, `cashflow` → `overview`), and it also special-cases the legacy `?tab=cashflow&dock=hu` combo deep link (from the retired Dòng tiền sub-hub) the same way, so no old bookmark or copilot deep link dead-ends.

Key shared components:

- `src/components/shell/BottomNav.tsx` — 3 tabs (Trang chủ `/`, Tài khoản `/accounts` + `/transactions`, PFM `/pfm`); active-tab matching is prefix-based per tab.
- `src/components/shell/AssistantFab.tsx` — floating action button (Sparkles icon) rendered above the tab bar on the top-level (festive) screens (`src/app/(festive)/layout.tsx`) — Trang chủ, Tài khoản, etc. — linking to `/assistant`. **No longer rendered inside `/pfm`**: the BIDV wallet reformat gave `/pfm`'s own layout a dedicated center FAB instead — originally add-transaction (`AddTxnFab`), retired and replaced by the voice quick-action FAB (`VoiceFab`, below) in Feature 5.
- `src/components/home/*` (`AccountSummaryCard`, `HomeQuickGrid`, `PromoCarousel`, `PromoCard`, `Dots`) — Home-specific presentation, not reused elsewhere.
- `src/components/transactions/TransactionListSection.tsx` — shared transaction list at the app level, used by `/transactions` (all accounts) and `/accounts/[id]` (scoped via an `accountId` filter prop). Not used inside `/pfm`; the PFM Giao dịch tab has its own list component (`PfmTxnList`, below), scoped to corrections/manual entries.
- `src/components/pfm/PfmBottomNav.tsx` + `src/components/pfm/VoiceFab.tsx` — the wallet chrome mounted by `pfm/layout.tsx`: a 4-tab bottom nav (styled after `BottomNav`, DRY) plus a center **🎤** FAB (Feature 5) opening `VoiceQuickPanel`, a half-screen sheet that records a voice question and sends it straight to the real agent — retired the earlier **＋** "Thêm giao dịch" FAB (`AddTxnFab`/`AddTxnForm`, deleted) entirely rather than relocating it. Supersedes the earlier `pfm/layout.tsx` decision to render no bottom nav at all (`plans/260908-pfm-chrome-redesign/`).
- `src/components/pfm/PfmTabHost.tsx` + `src/components/pfm/PfmTabs.tsx` — the single-route `/pfm` tab host: client-side switching (no navigation, no refetch — `useFinancials` loads once), `?tab` re-synced on every change (see above). Tabs (BIDV wallet reformat, `plans/260910-1626-pfm-bidv-wallet-reformat/`): **Tổng quan** (`OverviewTab`), **Giao dịch** (`PfmTxnList`), **Ngân sách** (`BudgetTab`), **Cài đặt** (`HuCategoryTab`). Each panel owns its own scroll region.
- `src/components/pfm/OverviewTab.tsx` + `src/components/pfm/cockpit/*` (`HeroNetWorth`, `StatTile`, `InsightStrip`, `Sparkline`) — the no-scroll-first "4-Question Cockpit": hero net worth, 2×2 KPI grid (cashflow net, end-of-month estimate, next obligation, runway), top-1 insight strip, a `NetWorthSummary` drill tile (assets/liabilities decomposed from `networth.breakdown`, one tap to `/pfm/wealth`), the `HuOverviewRow` envelope-allocation row (`src/components/hu-envelope/*`, see "Spending jars" below), and — folded in from the retired Dòng tiền tab — `SpendingSection` (spending donut by hũ + MoM + 6-month trend + "Xem chi tiết báo cáo" opening `SpendingReport`).
- **Ngân sách tab** (`src/components/budget/BudgetTab.tsx`, `BudgetGauge.tsx`, `HuBudgetCard.tsx`) — the per-jar budget UI consuming `jar-budget.ts` (see "Spending jars" below): a half-ring gauge over jars with a set limit, and one card per jar (spent/limit, progress bar, "Vượt hạn mức"/near-threshold warning, MoM delta); a reserved "Thu" sub-tab is an empty-state placeholder. Replaces the retired balance-lens **Hũ tab** (`HuTab.tsx`, deleted).
- **Giao dịch tab** (`src/components/transactions/PfmTxnList.tsx`, `TxnDetail.tsx`, `CategoryPickerSheet.tsx`) — a day-grouped transaction list (category chips, unclassified rows highlighted) reading category/hidden overrides from the corrections seam (`state/corrections.tsx`, see "Transaction module" below); `TxnDetail` + `CategoryPickerSheet` write those overrides (never mutate provider data — invariant #4). The manual "Thêm giao dịch" entry point (`AddTxnForm`, behind the old ＋ FAB) was retired in Feature 5 — `state/manual-txns.tsx` (`useManualTxns`) itself is unchanged and still used elsewhere (e.g. the jar-sourced-transfer self-reported entry in `TransferConfirm.tsx`).
- **Cài đặt tab — "Hũ & danh mục"** (`src/components/settings/HuCategoryTab.tsx`, `HuEditorSheet.tsx`, `CategoryManager.tsx`, `category-dedupe.ts`) — jar list + a jar editor sheet (name/color/icon/monthly limit/delete, force-moving remaining categories to "Khác" before delete) and a category manager (locked presets vs. reassignable expense categories, duplicate-label warning ⚠). Creating a brand-new category is deferred — see "Spending jars" below.
- **Onboarding** (`src/components/onboarding/PfmOnboarding.tsx`, `HuTemplatePicker.tsx`, `TrackedAccountsReview.tsx`, gated by `src/state/onboarding.ts`) — a first-run, one-screen setup shown by `pfm/page.tsx` in place of `PfmTabHost` until a local "onboarded" flag is set: pick one of the 3 seed jar templates, review the account provider's accounts, then land on Tổng quan.
- **Tài sản & Nợ manager** (`src/components/wealth/WealthManager.tsx`, route `/pfm/wealth`) — net-worth strip, editable user-record lists (`AssetEditor` / `LiabilityEditor` bottom sheets), read-only seed section, drop-notice banner. See "Asset and liability module" below for the CRUD/threading contract.
- **Kế hoạch and Trợ lý (still unmounted)** — `src/components/plan/PlanTab.tsx` (`GoalList` + `GoalEditor` + `GoalProjectionCard` for goal CRUD/what-if, `SurplusPanel`, `HealthPanel`) and `src/components/assistant/AssistantTab.tsx` (copilot entry Link + `SuggestedPrompts` + `InsightsView`) still exist as components, each carrying a `// DEFERRED:` header comment, but neither `PfmTabHost` layout (3-tab or 4-tab wallet) has referenced them since the 3-tab reformat — this stays a UI-unmount only, the goal/health engine and the AI facade are unaffected. `SurplusPanel` additionally lost its only valid data source in the wallet reformat (see "Spending jars" below). The rule-based insights feed `AssistantTab` used to host now renders inline inside the `/assistant` chat's empty state (`ChatPanel.tsx`). See "Goals module" below for the untouched CRUD/threading contract.
- `src/components/charts/CashflowLineChart.tsx` — multi-month expense-only trend chart (income was removed from the product; `CashflowTrendChart.tsx`, the old income/expense/net chart, was deleted), rendered inside `CashflowTrendCard`/`SpendingSection` on the Tổng quan tab, fed by `cashflowTrend()`.
- `src/components/report/SpendingDonut.tsx` + `SpendingReport.tsx` — the shared donut (≤6 slices, "Khác" pinned last, DRY between the Tổng quan mini-donut and the full report) and the detailed breakdown sheet (per-jar rows expandable to their categories), opened from `SpendingSection`'s "Xem chi tiết báo cáo" CTA.
- `src/components/wealth/HealthPanel.tsx` — 2-tile financial-health panel (runway, asset concentration — the income-derived surplus/essential-expense-coverage tiles were removed with income), fed by the composed `Financials.health`; currently unmounted along with `PlanTab` (see above).
- `src/components/insights/InsightFilters.tsx` — severity filter (info / attention / urgent), now rendered inside the `/assistant` chat's empty-state insights feed (`InsightsView` in `ChatPanel.tsx`).
- `src/components/primitives/ProvenanceChip.tsx` — thin wrapper over `SourceBadge` (+ optional freshness); one shared place for provenance styling (invariant #5), used across the Tổng quan, Ngân sách, and Wealth surfaces (also referenced by the currently-unmounted Kế hoạch components). **The visible pill is currently switched off app-wide** (`SHOW_SOURCE_BADGE = false` in `src/components/primitives/SourceBadge.tsx`, product decision — an all-mock demo made the source pills read as debug clutter on nearly every value); the provenance data model itself (`source`/freshness on every aggregate, invariant #5) is untouched, so re-enabling the pill is a one-line flip, not a data change.
- `src/components/states/UnknownValue.tsx` — renders `—` / "Chưa xác định", never `0₫` (invariant #6).
- `src/lib/format.ts` (`maskAccountNumber`) — masks an account number to its last 4 digits for display (e.g. `•••• 1991`); used by the Home account card and account list/detail headers. Presentation-only; does not touch the calculation engine or provider data.
- `src/lib/transfer-draft-store.ts` — session-scoped (`sessionStorage`) hand-off of a `TransferDraft`'s display fields (name, masked account, amount, memo, source label) from the chat `DraftCard` to `/transfer-confirm`, keyed by draft id. The draft's PII/financial fields never travel in the URL query string — only the `draftId` does. No account number (only the masked form) is ever stored, and nothing in this module executes a transfer; it purely carries display state across the client-side navigation boundary, consistent with the `TransferDraft` model and pipeline in "Tier B — draft-only tools" below.
- `src/lib/copilot-nav.ts` (`resolveIntentRoute`) — see "Copilot universal jump" below.
- `src/lib/persona-storage.ts` (`personaLocalStorageResource<T>()`) — see "Shared user-record CRUD infrastructure" below.

### Copilot universal jump (implemented)

`src/lib/copilot-nav.ts` — `resolveIntentRoute(intent)` is a **static code whitelist**, not an LLM navigation authority (invariant #2): the intent id is a strict enum and every route is a fixed literal with no free-text interpolation; any unknown intent falls back to `/pfm` (never a dead-end, never an injected route). Intents, remapped for the 4-tab wallet IA (`plans/260910-1626-pfm-bidv-wallet-reformat/`): `open-overview`, `open-cashflow` (→ Tổng quan, Dòng tiền folded in), `open-hu` (→ the **Ngân sách** tab — the old `hu` tab id, now the budget tab), `open-transactions`, `open-report` (→ Tổng quan, anchored at `REPORT_ANCHOR`), `open-wealth`, `open-assistant`. The former `open-plan` intent was removed along with the Kế hoạch tab; any CTA that used to open it now points at `open-hu` instead. It is the single source of truth consumed by the Assistant FAB, `SuggestedPrompts`, and the advisory brief's "nên làm gì" CTAs — all three render it as a **tappable `Link`**, never an auto-navigation, so an LLM-originated suggestion can only ever produce a link the user chooses to follow.

### Advisory brief — Báo cáo tư vấn (implemented, but currently unreachable from the UI)

`src/insights/brief.ts` (`composeMonthlyBrief`) + `src/insights/advisory-copy.ts` compose a **deterministic, templated** monthly brief from the same rule-based detectors (`runDetectors`) and cashflow facts the rest of the app uses — no LLM, no network call, grounding by construction. Output: `positives[]`, `risks[]`, `highlights[]` (each with evidence, a magnitude band, templated "nghĩa là gì" / "nên làm gì" copy, and a whitelisted `resolveIntentRoute` CTA), and a deduped `actions[]` list. Insufficient-data months return an honest empty message and zero actions; data-rich but detector-quiet months get one grounded fallback CTA derived from the month's envelope state (`Financials.jarEnvelope.pending`, never a fabricated action) — income was removed from the product, so the brief no longer reads `cashflow.net` (dropped from `CashflowResult`) or emits a "Dòng tiền dương" positive-cashflow block. Rendered by `src/components/insights/AdvisoryReport.tsx` (loading/error/insufficient/empty states) inside `src/components/cashflow/ReportBriefSheet.tsx`. **This sheet's only mount point was `CashflowChartView.tsx`** (the old Dòng tiền tab); the BIDV wallet reformat folded Dòng tiền's content into Tổng quan without carrying `ReportBriefSheet` along — Tổng quan's "Xem chi tiết báo cáo" CTA opens the plainer `SpendingReport` (donut/breakdown, no detector narrative) instead. `CashflowChartView`, `ReportBriefSheet`, `AdvisoryReport`, and `composeMonthlyBrief` are therefore **orphaned but intact and green** (component + engine + tests all still pass; `CashflowChartView` has no importer besides its own test). Re-wiring a CTA to this brief is pending future work — do not assume it is reachable in the shipped UI. **LLM narration of this brief was scoped for an earlier redesign but deferred** (red-team: injection/timeout/pipeline-shape risk not worth taking before the new IA is validated) — see EPIC-07/PFM-062 in `plans/project-backlog.md`.

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
- **Corrections seam (implemented, `src/state/corrections.tsx`):** category-override and hide/unhide are an in-session, persona-local overlay (`localStorage`, key `msb-pfm.corrections`) — never a mutation of provider `Transaction` data (invariant #4). `applyCorrections` merges a category override before any engine call; a `hidden` flag is dropped from the array `useFinancials` hands to the engine (the same way reversed/pending are already excluded) while the transaction stays visible and searchable in the Giao dịch list. Re-categorizing always requires picking a jar-mapped category, since every expense category belongs to exactly one jar.
- **Manual transactions (implemented, `src/state/manual-txns.tsx`):** the PFM ＋ FAB's "Thêm giao dịch" form creates a full `Transaction` record (`source: "self_reported"`, `status: "posted"`) persisted per-persona in `localStorage` and merged into the array `useFinancials` composes from — it counts toward spend/report exactly like a provider transaction, but is never bank-verified and never executes/moves money (invariant #3).

### Auto-categorization (enrichment overlay) — implemented, local heuristic + live LLM (VNG GreenNode)

Suggests a `categoryId` for `UNCLASSIFIED` transactions as a **validated enrichment overlay** on top of the corrections seam above. It never becomes a second source of financial truth (invariant #1) and never mutates provider `Transaction.categoryId` (invariant #4) — it is not part of the Tier A/B AI-facade pipeline described later in this document. With `"ai"` consent granted **and** a model key configured, it now calls a real hosted LLM (VNG GreenNode) through a same-origin proxy; without a key, or when that call fails, it degrades to the local keyword heuristic below rather than leaving the transaction unhandled.

- **`UNCLASSIFIED` sentinel** (`src/domain/models/categories.ts` — `UNCLASSIFIED = "unclassified"`, label "Chưa phân loại") is **not a member of the taxonomy**; it marks "no label yet", not a 26th category. `category-jars.ts` gives it its own pinned bucket (`UNCLASSIFIED_JAR_ID`/`UNCLASSIFIED_JAR_LABEL`, ordered right after the "Khác" catch-all jar) so un-enriched spend stays visibly "cần gắn nhãn" instead of silently folding into "Khác" — and it still counts toward total expense (invariant #6: an unknown *label*, never an unknown or zeroed *amount*). `isUnclassified(txn)` (`src/domain/categorize/unclassified.ts`) is the single eligibility gate every trigger and validator reuses: the sentinel **and** `type` in `{expense}` (income was removed from the taxonomy) — transfer/card_payment/fee/refund transactions are never offered a spend category.
- **One overlay, not a new store.** Suggestions live in the *same* txn-keyed corrections overlay as manual corrections (`src/state/corrections-core.ts`, `localStorage` key `msb-pfm.corrections`) — a `Correction` record now carries `origin: "user" | "ai" | "memory" | "heuristic"` and `status: "applied" | "pending"` alongside `categoryId`/`confidence`. `mergeAssignments` enforces a race guard: a user-authored record is never overwritten by a later AI/memory/heuristic assignment (`isUserOrigin`). `resolveEffective` keeps a `pending` assignment from changing the engine-visible category at all — the transaction stays `UNCLASSIFIED` for `computeFinancials` until confirmed (invariant #6).
- **Pipeline (`src/ai/categorize/categorize-service.ts`, `categorize()`):** eligibility filter (`isUnclassified`) → **user memory first** (deterministic, see below — a hit never calls a classifier) → remaining transactions chunked ≤ `CATEGORIZE_CHUNK_SIZE` (50; isolates one bad chunk from the rest) → `classify(inputs)` → **two-tier validation** on every result — (a) syntactic: `categoryId` is a real taxonomy id and not `UNCLASSIFIED`; (b) semantic: the category's `kind` must match the transaction's `type` (expense↔expense; income was removed from both the `TransactionType` and `CategoryKind` taxonomies). Either failure drops the suggestion; the transaction stays unclassified rather than getting an invented label. → **confidence gate** (`CATEGORIZE_CONFIDENCE_THRESHOLD = 0.8`): `≥0.8` → `status: "applied"` (counted immediately), else `status: "pending"` (surfaced, not counted).
- **Two classifier implementations behind one `ClassifyFn` function type** (`src/ai/categorize/types.ts` — a plain function, not an interface with two classes, so tests inject a fake):
  - `localClassify` (`local-classifier.ts`) — a small, deterministic Vietnamese merchant-keyword table (word-boundary matched). Reports a fixed, deliberately low confidence (0.5, below the 0.8 gate) so every hit lands `pending` — a keyword guess is never trusted enough to auto-apply and silently move a total. Tagged `origin: "heuristic"` and rendered "Gợi ý tự động" — **never** "AI gợi ý", because it is not a model.
  - `remoteClassify` (`remote-classifier.ts`) — **implemented**: `createRemoteClassify(userId)` makes a same-origin `fetch` to `POST /api/agent/categorize` (`src/app/api/agent/categorize/route.ts`). That route validates `user_id` and an items cap server-side, then calls `getLlmClient()` (see "LLM provider layer" below) and forwards the merchant/note text to the configured model — today, VNG GreenNode's MaaS when `AI_PLATFORM_API_KEY`/`LLM_PROVIDER=vng` are set. No key configured ⇒ the route returns `501`; a non-2xx response or an empty result set also makes `createRemoteClassify` throw, so the chunk is treated as failed and degrades rather than being silently mislabeled. The route does no re-validation of its own — the two-tier syntactic/semantic check and confidence gate above still apply to whatever the model returns, so the model stays untrusted (invariant #7) even though the call is now real. **Known prototype gap:** the proxy has no real server auth or rate limiting — `user_id` is a client-supplied, spoofable string — so a paid model now sits behind an effectively unauthenticated endpoint (oracle-abuse risk); see PFM-145 in `plans/project-backlog.md`.
- **Consent gate (`src/state/auto-categorize.tsx`):** sending merchant text off-device is gated on the `"ai"` consent scope (`hasScope(getConsent(), "ai")`, re-read on mount/persona-switch/cross-tab/same-tab consent-change events). With `"ai"` granted **and** a model key configured, merchant/note text IS sent off-device to the real LLM (GreenNode) via the same-origin proxy, tagged `origin: "ai"`; if that call is offline, unconfigured, or errors, the run degrades to the **local** heuristic instead (no text leaves the device for that chunk), honestly tagged `origin: "heuristic"` — never mislabelled as `"ai"`. Without `"ai"` consent, no classifier runs at all — only the user's own category memory (below) applies, and no merchant text leaves the device.
- **Category memory (`src/state/category-memory.tsx`):** a per-persona (`msb-pfm.category-memory.<cif>`) `normalizedMerchant → categoryId` map, checked before any classifier call (cost and trust: a merchant the user already labelled never re-prompts a guess). Written **only** by a real user accept/correct action (`remember`), never by classifier output; validated against the taxonomy on both write and read (`isMemorableCategory` — a dead/removed id is treated as a miss and pruned, never returned).
- Mounted once app-wide (`src/app/providers.tsx`: `CategoryMemoryProvider` → … → `AutoCategorizeProvider`) so the in-flight guard and the 500 ms auto-run debounce are shared across tab remounts, not reset per screen. `AutoCategorizeBar` (on-demand "Gắn nhãn giúp tôi" button + run summary), `TxnSuggestionBar` (per-row pending suggestion + one-tap "Đồng ý"), and `CategoryProvenanceBadge` (origin/status badge — the raw confidence number is never shown) are the UI surface, all under `src/components/transactions/`.

**Net effect on the invariants:** the engine (#1) never sees a classifier number, only a category id gated through validation; the overlay (#4) is the only thing that changes, never provider data; every suggestion carries `origin`/`confidence`/`status` (#5); a `pending` suggestion or an `UNCLASSIFIED` transaction is never coerced into a counted, zero-cost label (#6); and the set of categories a suggestion can land in is exactly the existing taxonomy (#7) — the classifier cannot introduce a new category. See `plans/project-backlog.md` PFM-145 for status and the tracked prototype limitations (the categorize proxy has no real server auth or rate limiting; consent is client-side only; only the VNG/GreenNode adapter is implemented).

### Transfer-purpose suggestion (implemented, separate taxonomy from category)

Suggests **why** a self-reported `type:"transfer"` transaction was sent — a distinct, deliberately-separate concern from the merchant-category auto-categorization above. It reuses the same LLM proxy/heuristic-fallback shape but never shares a namespace with `CATEGORIES`, so a "purpose" can never be mistaken for a spend category.

- **Taxonomy (`src/domain/models/transfer-purposes.ts`, `TRANSFER_PURPOSES`):** `family`, `savings`, `debt`, `self`, `gift`, `business`, `other` are non-spending (pure metadata, no category mapping); `rent`, `bill_split`, `pay_goods` are `spending: true`, each with a `mapsToCategoryId` (`housing`, `dining`, `shopping` respectively). Helpers `isTransferPurpose`, `isSpendingPurpose`, `purposeCategoryId`, `transferPurposeLabel` are the only way callers touch a purpose id — an id outside this table is never trusted (invariant #7).
- **Always pending, never auto-applied (invariant #6).** `useTransferPurposeSuggestion` (`src/state/use-transfer-purpose-suggestion.ts`) returns a suggestion that is display-only; it never writes to `manual-txns` or any store on its own. Only a user tap (`TransferCategorizeSection.applyPurpose`) commits anything.
- **Consent-gated, same pattern as auto-categorize.** With the `"ai"` scope granted, it calls the server-side LLM (GreenNode) via the existing `/api/agent/categorize` proxy, now parameterized with `mode: "transfer_purpose"` (`createRemoteClassify(userId, "transfer_purpose")`) so the route swaps in `TRANSFER_PURPOSE_SYSTEM_PROMPT` instead of the spending-category system prompt (`src/ai/categorize/prompt.ts`, `route.ts`). Without `"ai"` consent, or on any error/offline, it degrades to `localPurposeClassify` (`src/ai/transfer-purpose/local-purpose-classifier.ts`) — a small keyword table over the memo (`note`) and recipient name, fixed low confidence, no match ⇒ no suggestion (never guesses "other" as a default). Every returned id is re-validated against `isTransferPurpose` before it is surfaced, regardless of origin.
- **Accepting the suggestion is the only mutation path, and it is the SAME path as a manual purpose pick.** `TransferCategorizeSection` (mounted on the transfer success card, below the existing category picker) shows `TransferPurposeSuggestionBanner` ("Gợi ý mục đích: … · AI đề xuất/Đề xuất tự động · chờ bạn xác nhận") only while the transfer is unclassified. `[Đồng ý]` and manually picking from the purpose sheet both call `applyPurpose`, which:
  - for a **non-spending** purpose: sets `transferPurpose` metadata only; `categoryId`/`type` stay `transfer`, excluded from spending totals (invariant #6).
  - for a **spending** purpose: reclassifies into `mapsToCategoryId`, flips `type` to `expense` via the existing `typeForCategory` path, and syncs the owning jar's "Thực tế" (`spendFromJar`) exactly like a manual category pick — the refund/debit tracks the exact clamped amount previously charged, never inflating a jar's balance (same clamp-at-0 rule as "Confirm-screen bookkeeping" below).
  - a plain category pick (no purpose) always clears any previously-accepted `transferPurpose`, so stale purpose metadata never survives a re-categorization.
- **Known prototype gap (shared with auto-categorize, see PFM-145):** consent enforcement is client-side only — the `/api/agent/categorize` proxy validates `user_id`/items-cap but does not itself check or enforce the `"ai"` scope server-side. Do not treat this as a real trust boundary yet.

### Cash-flow module

- Aggregate expense by time period (income was removed from the product — the engine tracks spending only).
- Exclude internal transfers from cash-flow totals.
- Separate fixed and discretionary spending.
- Calculate period comparisons and end-of-period estimates.
- Build a multi-month trend for charting (`cashflow-trend.ts`), flagging months with no underlying data so the UI renders a gap rather than a misleading 0.
- Project end-of-month liquid cash and cash-runway months (`projection.ts`) — always `source: "estimated"`, and only computed for the current month; other months are `"unknown"`.
- Fold each user-defined spending jar's categories into a per-jar "đã tiêu vs hạn mức" budget line (`jar-budget.ts` — `evaluateJarBudget`); config persists per persona and has a dedicated CRUD UI in Cài đặt. See "Spending jars" below.

### Balance-sheet module

- Aggregate assets and liabilities.
- Calculate net worth and net-worth trend (`networth.ts` — `calculateNetWorth`, `networthTrend`), exposing the raw current/previous values plus a sparkline series and lowest-trust provenance.
- Compute explainable financial-health indicators (`health.ts` — cash runway, asset concentration; the income-derived surplus and essential-expense-coverage indicators were removed with income), each `null` rather than defaulted when its inputs are missing. Composed exactly once per `computeFinancials` call (`Financials.health`) and reused by every consumer (Tổng quan's Sức khỏe tile; `HealthPanel`, currently unmounted with the rest of the Kế hoạch tab) instead of each screen recomputing it.
- Keep source and freshness metadata.
- Distinguish verified, self-reported, and estimated values.

### Spending jars (Hũ chi tiêu) — implemented, category-group budget model

**This model retired the earlier "Model A" balance-lens partition** (a jar as a `%`/fixed-VND snapshot slice of the current account balance, `Σ earmarks + "Chưa phân bổ" ≡ số dư`), which shipped for one release and is now fully removed — code, components, and tests (`src/domain/engine/jars.ts`, `AllocationMeter`, `SurplusPanel`, `JarList`, `JarCard`, `HuTab`, and their tests were deleted in `plans/260910-1626-pfm-bidv-wallet-reformat/`, phase 08). The shipped model instead defines **a jar as a group of expense categories with an optional monthly `budgetLimit` (VND)** — it never earmarks, holds, or moves money.

`evaluateJarBudget(config, txns, period, prevPeriod, now)` (`src/domain/engine/jar-budget.ts`) is the whole engine — named to avoid colliding with the pre-existing per-category `budget.ts`:

- **Exactly-one category-to-jar mapping.** `categoryToJarMap` (`src/domain/engine/category-jars.ts`) and the invariant functions in `src/domain/jar-rules.ts` (`stripCategories`/`dedupeCategories`/`healOrphanCategories`, used server-side by every `/api/jars*` route handler — see "Persistence" below) enforce that every expense category belongs to exactly one jar; unassigning is disallowed (moving a category to a new jar auto-drops it from the old one), and an orphaned category (stale config, a shrunk `categoryIds` patch) heals into a catch-all **"Khác"** jar (`KHAC_JAR_ID`/`KHAC_JAR_LABEL`) as a defensive fallback so totals never silently drop a category. `src/state/jars.tsx` itself holds none of this logic anymore — it's a thin client (see below).
- **Per-jar spend reuses cash-flow rules, never re-derives them (DRY, invariant #2).** `spent`/`prevSpent` per jar sum `netExpenseByCategory` (`cashflow.ts`) over the jar's category ids for the selected and previous period — internal transfers excluded, refunds reversed, reversed dropped, pending kept separate; hidden transactions (the corrections seam) are already excluded upstream in `useFinancials`.
- **A limit stays unknown until set — never coerced to 0 (invariant #6).** `jar.budgetLimit === undefined` → `limitState: "unset"`, and `remaining`/`pct`/`status` are all `null`; the gauge's `totalLimit`/`pctUsed` are computed only over jars with a set limit (`setLines`), so an unset jar can never masquerade as a 0%/"ok" bar. `status` is `"over" | "near" (≥80%) | "ok"` for a set limit; `thresholdHit` flags the 80% line.
- **`now` is injected** so `daysLeft` and the month-over-month delta (`momDelta`/`momPct`, vs. `prevSpent`) are deterministic and testable.
- **Provenance per line (invariant #5):** each `JarBudgetLine` folds the lowest-trust source and latest freshness over its own contributing spend transactions (`lowestTrust`/`provenanceByCategory`), not a single uniform value for the whole result.
- `JarConfig` is **`version: 3`** (`src/domain/models/index.ts`); `Jar.allocation` (the balance-lens `%`/VND earmark field) was dropped entirely. A separate `JarAllocation` envelope-ledger interface (`{id, jarId, amount, createdAt, source}`) was reintroduced for one release to back a CASA-balance allocation feature and has since been **fully retired again** by the "Hũ một con số" (single-number) refactor described below — there is no `JarAllocation` type anywhere in the codebase today; the only number a jar carries is `budgetLimit`. Jars now persist in SQLite (`data/pfm.sqlite3`'s `jars` table, scoped by `cif` — see `data/jars/schema.md`) instead of browser `localStorage`, so there is no v1/v2 stored-config migration to run anymore: every row is written in the current shape from the start. `src/domain/jar-rules.ts` is the pure, framework-free invariant module (dedupe/heal/backfill/id-uniqueness/H3 re-sync, see below) shared by every `/api/jars*` route handler (`src/app/api/jars/**/route.ts`) — the server is the single source of truth, and `readJarConfig` (`src/lib/jars-store.ts`) re-normalizes on every read so a response is always healed and deduped regardless of how the underlying rows got there. `src/state/jars.tsx` (`JarConfigProvider`) is a thin client with no invariant logic of its own: each mutator (including the batch `updateJars`) calls the matching `Providers` method and stores whatever `JarConfig` comes back.
- **Templates:** `src/domain/models/jar-defaults.ts` defines three pickable templates (`JAR_TEMPLATE_LIST`) — Cá nhân (6 hũ, default), Gia đình (4 hũ), Kinh doanh (3 hũ) — each with a suggested `budgetLimit` per jar (labelled `estimated`, user-editable) and one-category-one-jar already enforced. A jar whose seed has no categories (a savings-type jar) is left with `budgetLimit: undefined` — a limit would be meaningless with nothing to sum, so it stays unset rather than a fabricated number. `configFromTemplate` builds a fresh `version: 3` config; applying a template replaces the whole jar set.
- **Persistence:** `Providers` (`src/providers/interfaces.ts`) exposes `getJarConfig()` (read) plus five mutators — `createJar`/`updateJar`/`removeJar`/`assignCategory`/`replaceJars` — each returning the full, freshly-persisted `JarConfig` so the client never has to recompute or re-fetch. The mock adapter (`src/providers/mock/mock-provider.ts`) backs every one of these with a `fetch()` call to `/api/jars*` (SQLite-backed, see "Spending jars" above) rather than `localStorage` — jars were the first (and so far only) domain to move off the shared `userRecordStore<T>()` localStorage mechanism the asset/liability/goal CRUD pairs still use. A real adapter maps the same six methods to the MSB preferences API (invariant #4) without changing the interface.
- **Extracted utilities (from the retired `jars.ts`):** `validateJarInput` (amount-mode only now that the percent/allocation mode is gone) moved to `src/domain/engine/jar-input.ts`; `resolvePrimaryAccount` moved to `src/domain/engine/primary-account.ts` (still used by the Tổng quan cockpit's primary-account resolution, independent of jars now).
- **UI:** the **Ngân sách** tab (`src/components/budget/BudgetTab.tsx`, `BudgetGauge.tsx`, `HuBudgetCard.tsx`) renders the gauge + per-jar cards, replacing the retired **Hũ tab**; the **Cài đặt** tab (`src/components/settings/HuCategoryTab.tsx` + `HuEditorSheet.tsx` + `CategoryManager.tsx`) is the jar/category CRUD, replacing the retired `JarSetup`/`JarEditor`/`CategoryAssigner`. `src/components/budget/PressureRow.tsx` is still the shared row primitive reused by `HuBudgetCard`. `src/app/pfm/jars/page.tsx` redirects to `/pfm?tab=budget` for legacy links.
- **Insight — sole budget warning:** `src/insights/detectors/jar-pressure.ts` now reads `Financials.jarBudget.lines` (not the retired `jarPartition`) and warns on the worst `status: "over"`/`"near"` jar among those with a set limit; it is the **only** budgeting insight the product surfaces — the pre-existing per-category `budgetPressure` detector was removed from the detector registry (`src/insights/run.ts`) in the same change to avoid double-warning the same overspend from two systems. The per-category engine itself (`budget.ts`/`evaluateBudget`/`Financials.budgetLines`/`Providers.getBudgets`) is **kept**, deliberately, as AI-facing structured data — ripping it out would touch the AI facade's `load-financials` path and ~8 tests for no product value (YAGNI).
- **Envelope model — "Hũ một con số" (single-number jar), implemented (plan `260917-jar-envelope-single-number`).** Layered on top of the jar-budget model above: the Tổng quan cockpit's "Hũ chi tiêu" row shows the CASA balance (Σ `availableBalance` of `type:"current"` accounts) split across jars as pure bookkeeping — no transfer, no OTP (invariant #3). This refactor **retired the short-lived `JarAllocation` envelope-ledger** (a separate `{id, jarId, amount, createdAt, source}` row per allocation, its own `jar_allocations` SQLite table, `/api/jar-allocations` route, `src/lib/jar-allocations-store.ts`, `src/state/jar-allocations.tsx`/`JarAllocationsProvider`, and the `Providers.getJarAllocations()`/`allocateBalance()` methods) that had briefly existed alongside `budgetLimit` as a second, conflated number ("tiền phân bổ" vs "hạn mức"). **None of that ledger exists anymore** — a jar now carries exactly **one number**: `budgetLimit` (`src/domain/models/index.ts`, on `Jar`), which simultaneously means allocation, spending ceiling, and starting balance. `src/lib/db.ts` runs `DROP TABLE IF EXISTS jar_allocations` as a one-way migration on every DB open, so an older `data/pfm.sqlite3` file self-heals on next boot (irreversible by design — the dropped rows were disposable mock display-partitions).
  - **Engine (`src/domain/engine/jar-envelope.ts`):** pure; derives every displayed number from `JarConfig` + `accounts` + `jar-budget.ts`'s per-jar net expense (reused, never re-derived — DRY, invariant #2) — nothing reads the stored `Jar.actualAmount`. `casaPool(accounts)` sums `availableBalance` over `type:"current"` accounts ("unknown" when there is none, never a fabricated 0 — invariant #6). `jarEnvelopeLines(config, spentByJar)` returns one `{jarId, label, budgetLimit, spent, remaining, overLimit, inUse, source, freshness}` line per jar, where `remaining = budgetLimit − spent` (`null` — "chưa có số dư" — when the jar has no `budgetLimit`, never 0; may be negative when overspent) and `overLimit = budgetLimit != null && spent > budgetLimit`. `evaluateJarEnvelope(config, accounts, spentByJar, period)` composes both and returns `pending.amount = max(0, pool − Σ budgetLimit)` ("chờ phân bổ").
  - **Cap enforcement (red-team finding C2, hard requirement):** Σ `budgetLimit` across all jars must never exceed the CASA pool, checked with `fitsCasaCap(jars, casaPool, drafts?)` (`src/domain/engine/allocation-plan.ts`) — pure, unit-tested, treats an `"unknown"` pool as failing (invariant #6: no denominator to validate against). This is enforced **server-side on both write doors**, not just as client UX: the batch `PATCH /api/jars` (used by "Chia ngay", one atomic transaction over multiple jars) and the single `PATCH /api/jars/:id` (used by the Cài đặt jar editor, only when the patch actually sets a numeric `budgetLimit`) both call `fitsCasaCap` against `casaPoolForCif(cif)` (`src/lib/casa-pool.ts`) and return **`422 { error, overBy }`** when the new total would exceed CASA. `casaPoolForCif` derives the pool deterministically server-side from the persona's seeded `salaryBase` — `18tr × salaryBase / 25tr`, the same formula `fixtures/generate.ts` uses for the `current` account balance — so the check needs no client-supplied number to trust. Client-side checks (`useCasaPool`, the `AllocationSheet` "Chia ngay" editor, `HuEditorSheet`'s Cài đặt editor) mirror this for instant UX feedback, but the server is authoritative.
  - **H3 — `actualAmount` re-sync on raise (`resyncActualOnRaise`, `src/domain/jar-rules.ts`):** `Jar.actualAmount` (the distinct Chuyển-tiền **spendable** wallet balance, used only by the jar-sourced-transfer flow) and `budgetLimit` (the single allocation/ceiling/balance number above) are two different fields with two different roles — this refactor does not merge them. When a `PATCH` **raises** `budgetLimit` on a jar that has not yet been drawn from (`actualAmount === previous budgetLimit`), `resyncActualOnRaise` pulls `actualAmount` up to the new limit too, so the transfer-source balance keeps pace with the single number the user just raised. **Lowering** a limit never touches `actualAmount` (that would vaporize real wallet money), and a jar already drawn down is left alone. This is the only place outside the transfer flow allowed to move `actualAmount`. Both `/api/jars` (batch) and `/api/jars/:id` (single) call it before persisting.
  - **UI (`src/components/hu-envelope/`):** `HuOverviewRow` (mounted in `OverviewTab`, between the cashflow card and `SpendingSection`) renders a horizontally-scrolling `PendingAllocationCard` ("Chờ phân bổ" = CASA pool not yet covered by any jar's `budgetLimit`, + "Chia ngay →") followed by one `JarEnvelopeCard` per jar (color/icon from the jar config, "còn lại trong hũ" = `remaining`). "Chia ngay →" opens `AllocationSheet` + `AllocationJarRow`: a **"số tổng mới" editor, not a top-up** — every row is prefilled with the jar's current `budgetLimit`, editing one jar's number never silently changes another's (red-team finding C1), and submitting calls the batch `updateJars` (one atomic write, one `setConfig`) rather than a per-jar loop. Same `budgetLimit` field is also editable from Cài đặt's `HuEditorSheet` (per-jar monthly-limit input) — both entry points write the exact same number.
  - **Both "còn lại" readings share one baseline, exactly.** Ngân sách tab: "còn lại" = `hạn mức − đã tiêu`. Tổng quan envelope card: "còn lại" = `budgetLimit − spent`. These are now the literal same formula (previously they could diverge once an explicit CASA allocation existed; that fork is gone).
- **`jar-budget.ts` and `jar-envelope.ts` remain two parallel engines by design (out of scope for this refactor, tracked as M7).** Ngân sách reads `jar-budget.ts`; Tổng quan's envelope row reads `jar-envelope.ts`; both read the same `jar.budgetLimit` off `JarConfig`, so they can never disagree on the number, but they are not merged into one engine. Unifying them is unscoped future work.
- **Level 3 surplus allocation remains orphaned — unrelated to the single-number model above.** `src/domain/engine/surplus.ts` (`surplusFromResidual`, `simulateSurplusAllocation`) is untouched code and its tests still pass, but its sole valid input — the long-retired balance-partition's "Chưa phân bổ" residual — no longer exists in this model, and `SurplusPanel` (its only UI) was deleted with the rest of the balance-lens component tree. No component currently imports `surplus.ts`; it has no data source and no mount point. Re-deriving "surplus" against the current model (e.g. from `cashflow.net`) is unscoped future work, not a shipped capability.

### Asset and liability module

- Manage manually declared assets and debts.
- Store valuation timestamp and confidence.
- Track debt terms and upcoming obligations.
- **CRUD (implemented, `/pfm/wealth`):** `Providers.getUserAssets` / `getUserLiabilities` (return `{records, dropped}`) plus `create/update/deleteAsset` and `create/update/deleteLiability` (`src/providers/interfaces.ts`), backed by the shared `userRecordStore<T>()`. These are **persistence-only** — `listAssets()` / `listLiabilities()` stay **seed-only** and are never also merged in the provider layer. The single merge point is `ComposeOptions.userAssets` / `userLiabilities` in `finance-compose.ts`: user records are context state (`AssetLiabilityProvider`) threaded into `computeFinancials`'s `useMemo` deps, merged with seed data for `calculateNetWorth` and `upcomingObligations` exactly once — so a mutation recomputes net worth/debt health live, with no double-count. New self-reported records carry `source: "self_reported"`; a blank valuation stays `null` (`UnknownValue`), never `0`. Validation (`src/domain/models/asset-liability-input.ts`) is the sole gate between the form and a committed record: blank/NaN/negative/over-cap and enum-checked types are blocked client-side before they can reach storage.

### Goals module

- Store target, deadline, current funding, priority, and contribution.
- Calculate required periodic contribution.
- Run deterministic completion scenarios.
- **CRUD (engine + provider implemented; Kế hoạch tab UI unmounted since the 3-tab reformat and not reintroduced by the later 4-tab wallet reformat):** mirrors the asset/liability pattern exactly. `GoalDataProvider` (`listGoals` seed-only + `getUserGoals` + `create/update/deleteGoal`) is backed by the same `userRecordStore<GoalRecord>()`; `GoalProvider` (`src/state/goals.tsx`) is the context, `ComposeOptions.userGoals` is the single merge point (`Financials.goals = [...raw.goals, ...userGoals]`), and `useFinancials` threads it into the `useMemo` deps for live recompute. `GoalProjectionCard` exposes a direct-tap `simulateGoal` what-if (live monthly-contribution slider); a parity test (`goal-parity.test.ts`) asserts the chat tool's `simulateGoal` call returns the identical projection as the direct-tap UI (invariant #1).

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
type: expense | transfer | refund | fee | card_payment
merchantName
merchantNormalizedName
categoryId
status: pending | posted | refunded | reversed
source
isRecurring
userEdited
note?             # free-text memo ("Nội dung"); DATA only — a signal for
                  # transfer-purpose suggestion, never an instruction
transferPurpose?  # for type:"transfer" only — the user-declared purpose id
                  # (see "Transfer-purpose suggestion" under "Transaction module"
                  # above); pure metadata, the engine never reads it and it
                  # never affects spending totals on its own
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

The composed `Providers` bundle (`src/providers/interfaces.ts`) also exposes `getJarConfig()`/`createJar`/`updateJar`/`updateJars`/`removeJar`/`assignCategory`/`replaceJars` (Hũ — SQLite-backed via `/api/jars*`, not `localStorage`, see "Spending jars" above; `updateJars` is the atomic batch mutator behind "Chia ngay" — there is no separate allocation-ledger provider method any more, `budgetLimit` on `Jar` is the only number), and the CRUD pairs for user assets, liabilities, and goals (`getUserAssets`/`create·update·deleteAsset`, `getUserLiabilities`/`create·update·deleteLiability`, `getUserGoals`/`create·update·deleteGoal`) — persistence-only, backed by the mock adapter's shared `userRecordStore<T>()` (persona-scoped `localStorage`, versioned envelope, per-record guard). See "Shared user-record CRUD infrastructure" in the IA section for that shared strategy and the intended real-adapter mapping.

## Financial calculation rules

The calculation engine is pure and independently testable.

Required rules:

- Internal transfers do not count as spending (income was removed from the product; the engine only tracks expense).
- Refunds reverse the appropriate expense category.
- Reversed transactions are excluded from final totals.
- Pending transactions are separated from posted totals.
- Net worth equals assets minus liabilities.
- Missing values remain unknown; they are not silently defaulted to zero.
- Every aggregate exposes its period, source coverage, and freshness.

## AI facade

**Status:** the facade is implemented and live, not a stub. Tier A (read-only analytics + deterministic simulation) is wired to a real LLM with an offline fallback. Tier B (draft-only transfer tools, Level 3, `EPIC-13`, `plans/project-backlog.md`) is also implemented: the agent can prepare a `TransferDraft`, gated by the `ENABLE_TRANSFER_DRAFTING` feature flag (default ON in the prototype). The agent still never executes, confirms, or authenticates a transfer — that stays with the human in the native MSB confirm flow. When the flag is off, transfer-intent messages fall back to the original hard refusal (no draft, no tool call).

The AI facade is an application boundary, not a domain module. It cannot mutate the ledger.

**Scope note:** everything below (LLM provider layer, Tier A/B tools, request pipeline) is the chat assistant's facade. Auto-categorization ("Auto-categorization (enrichment overlay)" under "Transaction module" above) and transfer-purpose suggestion ("Transfer-purpose suggestion" under "Transaction module" above) are separate, lighter-weight enrichment pipelines — neither is a Tier A/B tool call and neither goes through this orchestrator. Both share the `getLlmClient()` provider layer described below and the same `/api/agent/categorize` proxy route (transfer-purpose passes `mode: "transfer_purpose"` to swap in a different system prompt), and with `"ai"` consent and a key configured they call a real model (VNG GreenNode), falling back to a local keyword heuristic (and, for auto-categorize, per-user memory) otherwise. Do not read the "implemented and live" status below as describing the chat facade's Tier A/B tool pipeline, which neither of these enrichment pipelines uses.

### LLM provider layer (implemented)

- `src/ai/llm/types.ts` — provider-neutral `LlmClient` / `LlmChatMessage` / `LlmCompletionOptions` contract (text in, text out — the client never returns a number the engine consumes, invariant #1). The pipeline depends only on this; adding a provider means writing one adapter, not touching the pipeline.
- `src/ai/llm/openai-compatible-client.ts` — adapter for an OpenAI-compatible Chat Completions endpoint (Bearer API key). Currently used for **VNG GreenNode's MaaS** (default model `qwen/qwen3.6-flash`, endpoint `https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1`, overridable via `LLM_MODEL`/`LLM_BASE_URL`).
- `src/ai/llm/index.ts` (`getLlmClient()`) — selects a provider from `LLM_PROVIDER` (see `.env.example`): explicit `"vng"` uses the adapter above when `AI_PLATFORM_API_KEY` is set; if unset, it infers `"vng"` when that key is present, else falls back toward `"anthropic"`. **Only the VNG/GreenNode adapter is implemented in this prototype slice** — `"anthropic"` (or any other value) has no adapter yet and resolves to `null` (offline) regardless of provider selection. Returns `null` — not an error — whenever no matching key/adapter is available, so the app always builds and runs without one.
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

#### Confirm-screen bookkeeping (`src/app/transfer-confirm/TransferConfirm.tsx`)

The mock confirm screen is outside the facade (the AI never reaches it). On confirm it records **exactly one** `self_reported` transaction (like the ＋ manual entry — never money movement, invariant #3) and lets the user *optionally* categorize it:

- **Type is derived from the category's kind, never hardcoded** (`typeForCategory`): a jar-sourced transfer defaults to the jar's first (expense) category; an account-sourced transfer, or a jar with no categories, defaults to `CATEGORY.transfer` → `type:"transfer"`, which the engine excludes from spending totals by type (invariant #6). This makes categorization the deliberate act that turns a transfer into counted spend.
- **Idempotency** is enforced without adding a field to `Transaction`: a `committedRef` latch (blocks a synchronous double-tap before any `await`) plus draft consumption (`deleteTransferDraft` marks the draft used in `sessionStorage`; a reload/replay shows a "đã hoàn tất" state, never an editable form again).
- **Manual-txns storage is scoped per persona** (`msb-pfm.manual-txns.<cif>`) and reloads on persona switch, so a transfer's recipient name never leaks across personas.
- **Deliberate divergence (jar "Thực tế" vs account balance):** when an *account-sourced* transfer is re-categorized into a category owned by a jar, the confirm screen debits that jar's real balance (`spendFromJar`) — and refunds the previous jar if the category changes again — to keep the jar's **Thực tế** in sync with **Ngân sách**. It does **not** debit the account balance for account-sourced transfers (old behavior preserved), so a jar's Thực tế and its underlying account balance can diverge in this case. This is an intentional prototype tradeoff (prioritizing jar Thực tế↔Ngân sách consistency). `spendFromJar` clamps at `Math.max(0, …)`, so a refund after an over-spend that was clamped to 0 does not restore perfectly — also accepted for the prototype. A durable correction path exists on the transaction-detail screen (`TxnDetail.tsx`, via the `useCorrections` overlay) for `self_reported` records, but that path re-classifies the txn only — it does **not** re-run the jar `spendFromJar` sync, so a category change made there can leave the jar's Thực tế stale. Keeping the two paths consistent is out of scope for this prototype.
- **"Phân loại giao dịch" on this same success card also hosts transfer-purpose suggestion** (`TransferCategorizeSection` → `TransferPurposeSuggestionBanner`, see "Transfer-purpose suggestion" under "Transaction module" above) — a separate, AI/heuristic-suggested "why" label layered on top of the category picker described here. Accepting a `spending` purpose reuses this exact `applyCategory`/`spendFromJar` path (same clamp-at-0 refund behavior); a non-spending purpose only ever writes `transferPurpose` metadata and never touches a jar.

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
- Single-number envelope identity (implemented — `src/domain/engine/__tests__/jar-envelope.test.ts`): `pending.amount === max(0, pool − Σ budgetLimit)` and `remaining === budgetLimit − spent` per jar, on fixtures — including the no-`budgetLimit` case (`remaining`/`overLimit` never fabricate a 0), the overspent (negative `remaining`) case, and the no-current-account case (pool/pending stay "unknown"), plus a determinism check (calculation-correctness gate).
- Cap-validator and H3 re-sync tests (implemented — `src/domain/engine/__tests__/allocation-plan.test.ts` for `fitsCasaCap`; `src/domain/__tests__/jar-rules-resync.test.ts` and `src/app/api/jars/__tests__/route.test.ts` for `resyncActualOnRaise`): Σ `budgetLimit` never exceeds `casaPoolForCif`'s CASA pool on either write door, and `actualAmount` only re-syncs up on an undrawn jar's limit raise, never on a decrease.
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
- Model gateway and evaluation pipeline (the auto-categorization remote classifier already calls a real model in the prototype — VNG GreenNode, via `src/ai/llm/`; production hardening means real server auth/session binding and rate limiting on the proxy, not just wiring a backend — see "Auto-categorization" under "Transaction module" above).
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
