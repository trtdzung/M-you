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
- `src/components/pfm/OverviewTab.tsx` — the Tổng quan screen: a `NetWorthSummary` drill tile (assets/liabilities decomposed from `networth.breakdown`, one tap to `/pfm/wealth`), the `HuOverviewRow` envelope-allocation row (`src/components/hu-envelope/*`, see "Spending jars" below), and — folded in from the retired Dòng tiền tab — `SpendingSection` (spending donut by hũ + MoM + 6-month trend + "Xem chi tiết báo cáo" opening `SpendingReport`).
- **Ngân sách tab** (`src/components/budget/BudgetTab.tsx`, `BudgetGauge.tsx`, `HuBudgetCard.tsx`) — the per-jar budget UI consuming `jar-budget.ts` (see "Spending jars" below): a half-ring gauge over jars with a set limit, and one card per jar (spent/limit, progress bar, "Vượt hạn mức"/near-threshold warning, MoM delta); a reserved "Thu" sub-tab is an empty-state placeholder. Replaces the retired balance-lens **Hũ tab** (`HuTab.tsx`, deleted).
- **Giao dịch tab** (`src/components/transactions/PfmTxnList.tsx`, `TxnDetail.tsx`, `CategoryPickerSheet.tsx`) — a day-grouped transaction list (category chips, unclassified rows highlighted) reading category/hidden overrides from the corrections seam (`state/corrections.tsx`, see "Transaction module" below); `TxnDetail` + `CategoryPickerSheet` write those overrides (never mutate provider data — invariant #4). The manual "Thêm giao dịch" entry point (`AddTxnForm`, behind the old ＋ FAB) was retired in Feature 5 — `state/manual-txns.tsx` (`useManualTxns`) itself is unchanged and still used elsewhere (e.g. the jar-sourced-transfer self-reported entry in `TransferConfirm.tsx`).
- **Cài đặt tab — "Hũ & danh mục"** (`src/components/settings/HuCategoryTab.tsx`, `HuEditorSheet.tsx`, `HuCategoryPicker.tsx`, `CategoryManager.tsx`, `CategoryCreateSheet.tsx`, `CategoryDeleteSheet.tsx`, `CategoryRowActions.tsx`, `category-dedupe.ts`) — jar list + a jar editor sheet (name/color/icon/monthly limit/delete, force-moving remaining categories to "Khác" before delete, plus `HuCategoryPicker`, a full add/remove category picker scoped to that jar) and a category manager with full CRUD on the persona's own taxonomy (create/rename/hide/delete for custom categories, locked presets, duplicate-label warning ⚠, an "Đã ẩn (k)" archived group). See "Spending jars" below for the taxonomy/persistence model.
- **Onboarding** (`src/components/onboarding/PfmOnboarding.tsx`, `HuTemplatePicker.tsx`, `TrackedAccountsReview.tsx`, gated by `src/state/onboarding.ts`) — a first-run, one-screen setup shown by `pfm/page.tsx` in place of `PfmTabHost` until a local "onboarded" flag is set: pick one of the 3 seed jar templates, review the account provider's accounts, then land on Tổng quan.
- **Tài sản & Nợ manager** (`src/components/wealth/WealthManager.tsx`, route `/pfm/wealth`) — net-worth strip, editable user-record lists (`AssetEditor` / `LiabilityEditor` bottom sheets), read-only seed section, drop-notice banner. See "Asset and liability module" below for the CRUD/threading contract.
- **Kế hoạch and Trợ lý (removed)** — the unmounted Kế hoạch/Trợ lý tab components (`PlanTab`, goal list/editor/projection card, `SurplusPanel`, `HealthPanel`, `AssistantTab`) were deleted as dead code. The goal/health/surplus engine and the AI facade are unaffected; the rule-based insights feed renders inside the `/assistant` chat's empty state (`ChatPanel.tsx`). See "Goals module" below for the CRUD/threading contract.
- `src/components/charts/CashflowLineChart.tsx` — multi-month expense-only trend chart (income was removed from the product; `CashflowTrendChart.tsx`, the old income/expense/net chart, was deleted), rendered inside `CashflowTrendCard`/`SpendingSection` on the Tổng quan tab, fed by `cashflowTrend()`.
- `src/components/report/SpendingDonut.tsx` + `SpendingReport.tsx` — the shared donut (≤6 slices, "Khác" pinned last, DRY between the Tổng quan mini-donut and the full report) and the detailed breakdown sheet (per-jar rows expandable to their categories), opened from `SpendingSection`'s "Xem chi tiết báo cáo" CTA.
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

The deterministic monthly advisory brief (`composeMonthlyBrief`, `advisory-copy.ts`, `AdvisoryReport`, `ReportBriefSheet`) lost its only mount point in the wallet reformat and was removed as dead code (2026-09-19). Tổng quan's "Xem chi tiết báo cáo" CTA opens `SpendingReport` (donut/breakdown). Re-introducing a detector-narrated brief is future work — see EPIC-07/PFM-062 in `plans/project-backlog.md`.

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
  - for a **spending** purpose: reclassifies into `mapsToCategoryId` and flips `type` to `expense` via the existing `typeForCategory` path — exactly like a manual category pick. The category move alone re-routes the spend to the owning jar (the jar's `spendable` is derived as `max(0, budgetLimit − spent)`, so recording the expense against the jar's category is what draws its balance down); there is no separate jar-balance write.
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
- Compute explainable financial-health indicators (`health.ts` — cash runway, asset concentration; the income-derived surplus and essential-expense-coverage indicators were removed with income), each `null` rather than defaulted when its inputs are missing. Composed exactly once per `computeFinancials` call (`Financials.health`) and reused by every consumer (Tổng quan's Sức khỏe tile) instead of each screen recomputing it.
- Keep source and freshness metadata.
- Distinguish verified, self-reported, and estimated values.

### Spending jars (Hũ chi tiêu) — implemented, category-group budget model

**This model retired the earlier "Model A" balance-lens partition** (a jar as a `%`/fixed-VND snapshot slice of the current account balance, `Σ earmarks + "Chưa phân bổ" ≡ số dư`), which shipped for one release and is now fully removed — code, components, and tests (`src/domain/engine/jars.ts`, `AllocationMeter`, `SurplusPanel`, `JarList`, `JarCard`, `HuTab`, and their tests were deleted in `plans/260910-1626-pfm-bidv-wallet-reformat/`, phase 08). The shipped model instead defines **a jar as a group of expense categories with an optional monthly `budgetLimit` (VND)** — it never earmarks, holds, or moves money.

`evaluateJarBudget(config, txns, period, prevPeriod, now)` (`src/domain/engine/jar-budget.ts`) is the whole engine — named to avoid colliding with the pre-existing per-category `budget.ts`:

- **Exactly-one category-to-jar mapping.** `categoryToJarMap` (`src/domain/engine/category-jars.ts`) and the invariant functions in `src/domain/jar-rules.ts` (`stripCategories`/`dedupeCategories`/`healOrphanCategories`, used server-side by every `/api/jars*` route handler — see "Persistence" below) enforce that every expense category belongs to exactly one jar; unassigning is disallowed (moving a category to a new jar auto-drops it from the old one), and an orphaned category (stale config, a shrunk `categoryIds` patch) heals into a catch-all **"Khác"** jar (`KHAC_JAR_ID`/`KHAC_JAR_LABEL`) as a defensive fallback so totals never silently drop a category. `src/state/jars.tsx` itself holds none of this logic anymore — it's a thin client (see below).
- **Per-jar spend reuses cash-flow rules, never re-derives them (DRY, invariant #2).** `spent`/`prevSpent` per jar sum `netExpenseByCategory` (`cashflow.ts`) over the jar's category ids for the selected and previous period — internal transfers excluded, refunds reversed, reversed dropped, pending kept separate; hidden transactions (the corrections seam) are already excluded upstream in `useFinancials`.
- **A limit stays unknown until set — never coerced to 0 (invariant #6).** `jar.budgetLimit === undefined` → `limitState: "unset"`, and `remaining`/`pct`/`status` are all `null`; the gauge's `totalLimit`/`pctUsed` are computed only over jars with a set limit (`setLines`), so an unset jar can never masquerade as a 0%/"ok" bar. `status` is `"over" | "near" (≥80%) | "ok"` for a set limit; `thresholdHit` flags the 80% line.
- **Two independent axes (plan `260920-1317-jar-transfer-balance-not-limit`).** `pct`/`status`/`thresholdHit` are always measured against the jar's ORIGINAL `limit` — an inter-jar rebalance never raises or lowers it, so `status === "over"` is exactly `spent > limit` regardless of any transfer coverage. `remaining` (below) is the separate BALANCE axis: it folds the rebalance net, `pct`/`status` do not. A jar can be simultaneously "Đã vượt hạn mức" (plan axis, `status: "over"`) and topped back up ("Đã bù", balance axis, `remaining >= 0`) — the UI shows both, never lets one silence the other. There is no `effectiveLimit`; that intermediate (rebalance-adjusted ceiling) existed briefly and was removed because it let a transfer rewrite the user's own plan.
- **`now` is injected** so `daysLeft` and the month-over-month delta (`momDelta`/`momPct`, vs. `prevSpent`) are deterministic and testable.
- **Provenance per line (invariant #5):** each `JarBudgetLine` folds the lowest-trust source and latest freshness over its own contributing spend transactions (`lowestTrust`/`provenanceByCategory`), not a single uniform value for the whole result.
- `JarConfig` is **`version: 3`** (`src/domain/models/index.ts`); `Jar.allocation` (the balance-lens `%`/VND earmark field) was dropped entirely. A separate `JarAllocation` envelope-ledger interface (`{id, jarId, amount, createdAt, source}`) was reintroduced for one release to back a CASA-balance allocation feature and has since been **fully retired again** by the "Hũ một con số" (single-number) refactor described below — there is no `JarAllocation` type anywhere in the codebase today; the only number a jar carries is `budgetLimit`. Jars now persist in SQLite (`data/pfm.sqlite3`'s `jars` table, scoped by `cif` — see `data/jars/schema.md`) instead of browser `localStorage`, so there is no v1/v2 stored-config migration to run anymore: every row is written in the current shape from the start. `src/domain/jar-rules.ts` is the pure, framework-free invariant module (dedupe/heal/id-uniqueness) shared by every `/api/jars*` route handler (`src/app/api/jars/**/route.ts`) — the server is the single source of truth, and `readJarConfig` (`src/lib/jars-store.ts`) re-normalizes on every read so a response is always healed and deduped regardless of how the underlying rows got there. `src/state/jars.tsx` (`JarConfigProvider`) is a thin client with no invariant logic of its own: each mutator (including the batch `updateJars`) calls the matching `Providers` method and stores whatever `JarConfig` comes back.
- **Templates:** `src/domain/models/jar-defaults.ts` defines three pickable templates (`JAR_TEMPLATE_LIST`) — Cá nhân (6 hũ, default), Gia đình (4 hũ), Kinh doanh (3 hũ) — each with a suggested `budgetLimit` per jar (labelled `estimated`, user-editable) and one-category-one-jar already enforced. A jar whose seed has no categories (a savings-type jar) is left with `budgetLimit: undefined` — a limit would be meaningless with nothing to sum, so it stays unset rather than a fabricated number. `configFromTemplate` builds a fresh `version: 3` config; applying a template replaces the whole jar set.
- **Category taxonomy — user-editable, per persona, implemented (plan `260920-1019-jar-category-ux-rework`).** `categories` is per-cif (`PRIMARY KEY (cif, id)`, `data/schema.sql`), with `custom` (`0` = bundled preset, `1` = user-created) and `archived_at` (`NULL` = active) columns, lazily seeded per cif from the bundled `CATEGORIES` constant on first read — the constant is a **seed only** from this point on. `GET`/`POST /api/categories` and `PATCH`/`DELETE /api/categories/:id` (`src/lib/categories-store.ts`, id-slugging/label validation in `src/domain/models/category-rules.ts`) are the only write doors; a built-in row rejects rename/delete with `403`. Deleting a category still in use is rejected with `409 { usedBy }` — the remedy is `archiveCategory` (hide), which keeps the category's jar membership so no historical jar/spend total moves (invariants #5, #6); an unused custom category deletes outright, stripped from its jar in the same transaction. `src/state/categories.tsx` (`CategoryTaxonomyProvider`/`useCategories()`) mirrors `src/state/jars.tsx`'s serial queue + persona generation guard and is mounted **inside** `JarConfigProvider` — no component calls `/api/categories` directly (invariant #4). A category write also returns the resulting `JarConfig` (the server heals a new/re-homed category into "Khác"), applied through the jar provider's own queue (`applyServerConfig`) so the two state trees never diverge and a category can never appear in two jars client-side. Every engine function that needs the taxonomy now takes it as an explicit parameter (an id set or a label map) instead of reading the bundled constant, and `categoryColor` (`src/lib/category-colors.ts`) gained a second, preset-disjoint 8-hue tier hashed (FNV-1a) from the category id, so a custom category gets a stable colour that can never collide with a preset's and survives a rename. The AI categorize prompt (`src/ai/categorize/prompt.ts`) is built from the persona's stored taxonomy and the model's answer is validated against exactly that set (invariant #2) — an id outside it is dropped, never invented. Only `src/lib/categories-store.ts` (seed), `src/domain/models/jar-defaults.ts` (preset-only jar templates), and the mock fixture generator still read the bundled `CATEGORIES` constant directly; `no-bundled-taxonomy-imports.test.ts` asserts nothing else does.
- **Persistence:** `Providers` (`src/providers/interfaces.ts`) exposes `getJarConfig()` (read) plus five mutators — `createJar`/`updateJar`/`removeJar`/`assignCategory`/`replaceJars` — each returning the full, freshly-persisted `JarConfig` so the client never has to recompute or re-fetch. The mock adapter (`src/providers/mock/mock-provider.ts`) backs every one of these with a `fetch()` call to `/api/jars*` (SQLite-backed, see "Spending jars" above) rather than `localStorage` — jars were the first (and so far only) domain to move off the shared `userRecordStore<T>()` localStorage mechanism the asset/liability/goal CRUD pairs still use. A real adapter maps the same six methods to the MSB preferences API (invariant #4) without changing the interface.
- **UI:** the **Ngân sách** tab (`src/components/budget/BudgetTab.tsx`, `BudgetGauge.tsx`, `HuBudgetCard.tsx`) renders the gauge + per-jar cards, replacing the retired **Hũ tab**; the **Cài đặt** tab (`src/components/settings/HuCategoryTab.tsx` + `HuEditorSheet.tsx` + `HuCategoryPicker.tsx` + `CategoryManager.tsx` + `CategoryCreateSheet.tsx` + `CategoryDeleteSheet.tsx` + `CategoryRowActions.tsx`) is the jar/category CRUD, replacing the retired `JarSetup`/`JarEditor`/`CategoryAssigner`. `src/components/budget/PressureRow.tsx` is still the shared row primitive reused by `HuBudgetCard`. `src/app/pfm/jars/page.tsx` redirects to `/pfm?tab=budget` for legacy links.
- **Insight — sole budget warning:** `src/insights/detectors/jar-pressure.ts` now reads `Financials.jarBudget.lines` (not the retired `jarPartition`) and warns on the worst `status: "over"`/`"near"` jar among those with a set limit — **skipping an `over` jar whose balance was already topped back up** (`remaining >= 0`, only reachable via a covering rebalance), because `jar-overspend-covered` is the sole narrator for that case and the two must not tell the same story twice (H3); it is the **only** budgeting insight the product surfaces — the pre-existing per-category `budgetPressure` detector was removed from the detector registry (`src/insights/run.ts`) in the same change to avoid double-warning the same overspend from two systems. The per-category engine itself (`budget.ts`/`evaluateBudget`/`Financials.budgetLines`/`Providers.getBudgets`) is **kept**, deliberately, as AI-facing structured data — ripping it out would touch the AI facade's `load-financials` path and ~8 tests for no product value (YAGNI).
- **Envelope model — "Hũ một con số" (single-number jar), implemented (plan `260917-jar-envelope-single-number`).** Layered on top of the jar-budget model above: the Tổng quan cockpit's "Hũ chi tiêu" row shows the CASA balance (Σ `availableBalance` of `type:"current"` accounts) split across jars as pure bookkeeping — no transfer, no OTP (invariant #3). This refactor **retired the short-lived `JarAllocation` envelope-ledger** (a separate `{id, jarId, amount, createdAt, source}` row per allocation, its own `jar_allocations` SQLite table, `/api/jar-allocations` route, `src/lib/jar-allocations-store.ts`, `src/state/jar-allocations.tsx`/`JarAllocationsProvider`, and the `Providers.getJarAllocations()`/`allocateBalance()` methods) that had briefly existed alongside `budgetLimit` as a second, conflated number ("tiền phân bổ" vs "hạn mức"). **None of that ledger exists anymore** — a jar now carries exactly **one number**: `budgetLimit` (`src/domain/models/index.ts`, on `Jar`), which simultaneously means allocation, spending ceiling, and starting balance. `src/lib/db.ts` runs `DROP TABLE IF EXISTS jar_allocations` as a one-way migration on every DB open, so an older `data/pfm.sqlite3` file self-heals on next boot (irreversible by design — the dropped rows were disposable mock display-partitions).
  - **Engine (`src/domain/engine/jar-envelope.ts`):** pure; derives every displayed number from `JarConfig` + `accounts` + `jar-budget.ts`'s per-jar net expense (reused, never re-derived — DRY, invariant #2) — a jar carries no stored balance; every spendable figure is derived from `budgetLimit − spent`. `casaPool(accounts)` sums `availableBalance` over `type:"current"` accounts ("unknown" when there is none, never a fabricated 0 — invariant #6). `jarEnvelopeLines(config, spentByJar, rebalanceNetByJar)` returns one `{jarId, label, budgetLimit, spent, remaining, overLimit, inUse, source, freshness}` line per jar, where `remaining = budgetLimit − spent + rebalanceNet` (`Σ nhận − Σ cho`; `null` — "chưa có số dư" — when the jar has no `budgetLimit`, never 0; may be negative when overspent) — the BALANCE axis. `overLimit = budgetLimit != null && spent > budgetLimit` stays on the PLAN axis and never reads the rebalance net, so a jar topped back up to `remaining >= 0` still reads `overLimit: true` if it spent past its own limit (same two-axis split as `JarBudgetLine.status` above). `evaluateJarEnvelope(config, accounts, spentByJar, period)` composes both and returns `pending.amount = max(0, pool − Σ budgetLimit)` ("chờ phân bổ").
  - **Cap enforcement (red-team finding C2, hard requirement):** Σ `budgetLimit` across all jars must never exceed the CASA pool, checked with `fitsCasaCap(jars, casaPool, drafts?)` (`src/domain/engine/allocation-plan.ts`) — pure, unit-tested, treats an `"unknown"` pool as failing (invariant #6: no denominator to validate against). This is enforced **server-side on both write doors**, not just as client UX: the batch `PATCH /api/jars` (used by "Chia ngay", one atomic transaction over multiple jars) and the single `PATCH /api/jars/:id` (used by the Cài đặt jar editor, only when the patch actually sets a numeric `budgetLimit`) both call `fitsCasaCap` against `casaPoolForCif(cif)` (`src/lib/casa-pool.ts`) and return **`422 { error, overBy }`** when the new total would exceed CASA. `casaPoolForCif` derives the pool deterministically server-side from the persona's seeded `salaryBase` — `18tr × salaryBase / 25tr`, the same formula `fixtures/generate.ts` uses for the `current` account balance — so the check needs no client-supplied number to trust. Client-side checks (`useCasaPool`, the `AllocationSheet` "Chia ngay" editor, `HuEditorSheet`'s Cài đặt editor) mirror this for instant UX feedback, but the server is authoritative.
  - **Spendable is fully derived — no separate `actualAmount` field (single-number, extended by plan `260918-1120-unify-jar-spendable-derived`).** An earlier iteration carried a distinct stored `Jar.actualAmount` (a Chuyển-tiền spendable wallet balance) alongside `budgetLimit`, re-synced on raise via a since-removed `resyncActualOnRaise` rule. That parallel ledger is **gone**: a jar now carries exactly one number, `budgetLimit`, and its Chuyển-tiền spendable is derived as `spendable = jarSpendable(remaining) = max(0, budgetLimit − spent)` (`src/domain/engine/jar-spendable.ts`) — `null` (non-fundable, never 0) when the jar has no limit (invariant #6). The transfer source picker and the Tổng quan overview now read the **same** derived per-jar number off `jarBudget.lines`; they can no longer drift. **Inter-jar coverage (plan `260918-1120-unify-jar-spendable-derived`):** when a jar overspends, the fix is NOT a stored-balance move and no longer the earlier "spread-as-spend" reallocation (`plannedReallocation`/`applyReallocation`, superseded below). It is recorded as ONE `Transaction` tagged `categoryId: "dieu-chinh-hu"` (`REBALANCE_CATEGORY`) carrying `rebalance {fromJarId, toJarId, triggerTxnId, origin}`; the engine folds `Σ nhận − Σ cho` into each jar's derived `remaining` (`src/domain/engine/jar-rebalance.ts` → `rebalanceNetByJar`), while `spent`/thu/chi stay untouched (invariant #6). **A rebalance moves the BALANCE axis only** — it never touches `budgetLimit`, `pct`, or `status`/`overLimit` (the PLAN axis), so a jar topped back up to `remaining >= 0` still reads "Đã vượt hạn mức" if `spent > budgetLimit` (plan `260920-1317-jar-transfer-balance-not-limit` — an earlier `effectiveLimit` intermediate let a transfer rewrite the ceiling itself; that field no longer exists). The rebalance rides the existing self-reported rows of `transactions` (`source = 'self_reported'`) — no `jar_rebalances` table — and `origin: "auto"|"manual"` is provenance (invariant #5).
  - **UI (`src/components/hu-envelope/`):** `HuOverviewRow` (mounted in `OverviewTab`, between the cashflow card and `SpendingSection`) renders a horizontally-scrolling `PendingAllocationCard` ("Chờ phân bổ" = CASA pool not yet covered by any jar's `budgetLimit`, + "Chia ngay →") followed by one `JarEnvelopeCard` per jar (color/icon from the jar config, "còn lại trong hũ" = `remaining`). "Chia ngay →" opens `AllocationSheet` + `AllocationJarRow`: a **"số tổng mới" editor, not a top-up** — editing one jar's number never silently changes another's (red-team finding C1), and submitting calls the batch `updateJars` (one atomic write, one `setConfig`) rather than a per-jar loop. **Divide-from-scratch (plan `260920-1317`):** every row **opens at 0** (rendered as an empty input with a `"0"` placeholder) and "Còn lại để chia" therefore opens at the **full CASA pool** — the sheet restates what it does, "chia lại toàn bộ số dư". The earlier prefilled-with-current-limit variant left a leftover remainder parked in "Còn lại để chia" (e.g. `880K`) that users read as an error rather than as unallocated money. A row left at 0 is saved as **chưa đặt hạn mức** (`budgetLimit: undefined`, invariant #6 — never a stored 0), with the jar's previous limit shown beside the input as reference only. Because an untouched sheet would otherwise wipe every limit, `canSubmit` additionally requires `allocated > 0`: opening the sheet and hitting "Lưu hạn mức" straight away can never clear the whole config. Same `budgetLimit` field is also editable from Cài đặt's `HuEditorSheet` (per-jar monthly-limit input) — both entry points write the exact same number.
  - **Both "còn lại" readings share one baseline, exactly.** Ngân sách tab: "còn lại" (Số dư) = `hạn mức − đã tiêu + rebalanceNet`. Tổng quan envelope card: "còn lại trong hũ" = `budgetLimit − spent + rebalanceNet`. These are the literal same formula (previously they could diverge once an explicit CASA allocation existed; that fork is gone) — both read the BALANCE axis, never the plan axis (`limit`/`budgetLimit` itself is invariant to a rebalance; see "Two independent axes" and "Inter-jar coverage" above).
- **`jar-budget.ts` and `jar-envelope.ts` remain two parallel engines by design (out of scope for this refactor, tracked as M7).** Ngân sách reads `jar-budget.ts`; Tổng quan's envelope row reads `jar-envelope.ts`; both read the same `jar.budgetLimit` off `JarConfig`, so they can never disagree on the number, but they are not merged into one engine. Unifying them is unscoped future work.
- **Level 3 surplus allocation remains orphaned — unrelated to the single-number model above.** `src/domain/engine/surplus.ts` (`surplusFromResidual`, `simulateSurplusAllocation`) is untouched code and its tests still pass, but its sole valid input — the long-retired balance-partition's "Chưa phân bổ" residual — no longer exists in this model, and `SurplusPanel` (its only UI) was deleted with the rest of the balance-lens component tree. No component currently imports `surplus.ts`; it has no data source and no mount point. Re-deriving "surplus" against the current model (e.g. from `cashflow.net`) is unscoped future work, not a shipped capability.

### Unallocated pool + funding decision tree (implemented, `PFM-025`/`PFM-146` follow-on, extended by plan `260918-1120-unify-jar-spendable-derived`)

Pure engine pieces feeding the Chuyển tiền (transfer) flow and every overspend-coverage path. Together with `jar-rebalance.ts` (see "Envelope model" above) they are the current, shipped "hũ không-thể-âm + auto-rebalance" model. None introduces a new stored field — every number is derived from `budgetLimit`, `spent`, and the rebalance legs already persisted as self-reported rows of `transactions`.

- **`src/domain/engine/casa-balance.ts` (`casaBalance(accounts)`)** — Σ `availableBalance` of `type === "current"` accounts, returned as a plain number (`0` when there is none). This is the one client/engine CASA selector shared by the pool and the funding tree below, and it mirrors the server-side `casaPoolForCif` (`src/lib/casa-pool.ts`) denominator exactly so the two never diverge on what "CASA" means.
- **`src/domain/engine/unallocated-pool.ts` (`computeUnallocatedPool({casaBalance, spendableTotal})`)** — the "Chưa phân bổ" transfer source, and the true pool identity: `amount = casaBalance − spendableTotal`, where `spendableTotal = Σ jarSpendable(line.remaining)` over `jarBudget.lines` (a jar with no limit contributes 0 via `jarSpendable(null) ?? 0` — never a fabricated balance). So `pool + Σ spendable ≡ CASA` by construction — **not** `pool + Σ remaining` (a jar's `remaining` can run negative or exceed `spendable`; only the floored `spendable` is ever pool-subtracted). Purely derived, never persisted (invariant #1: no new column, no drift). When jars collectively claim more than CASA holds, `amount` is returned as its true negative and `overAllocated: true` is set ("Vượt phân bổ") — the engine never clamps (invariant #6); callers decide how to present it (the transfer source picker shows `max(0, amount)` as the spendable figure, since a negative balance can't be transferred from, while still surfacing the `overAllocated` badge). Composed once into `Financials.unallocatedPool` (`finance-compose.ts`) and read from there by `HuOverviewRow` (Tổng quan "Hũ chi tiêu" row) and `BudgetTab` (Ngân sách total gauge) as well as the transfer source picker — one number, three surfaces, never independently recomputed.
- **`src/domain/engine/jar-funding.ts` (`evaluateFunding({amount, sourceJarId, casaBalance, jars})`)** — the funding decision tree used when a chosen transfer source (a jar, or the pool itself when `sourceJarId` is `null`) doesn't hold enough. Pure and deterministic; the LLM is not involved anywhere in this module. Returns a `FundingAssessment`:
  - `tier: "ok"` — the source already covers `amount`, no donors.
  - `tier: "topup"` — the source is short, but the pool plus other jars can cover the `shortfall`; `donors[]` lists the proposed chain (in take order) built by `buildDonorChain`: the pool ("Chưa phân bổ") first, then the other jars, largest `spendable` first. Only jars that `canDonate` (a non-null `spendable`) are candidates. Jars carry no donor role and none is protected — the retired `Jar.role` waterfall and its goal-confirm gate were removed.
  - `tier: "insufficient"` — `amount` exceeds the reachable ceiling (`min(CASA, source + pool + Σ donatable)`, a true over-allocated residual); hard block, empty `donors[]`, no draft is produced downstream.
  - When `sourceJarId` is `null` (a pool-sourced transfer), the direction inverts: the shortfall is against the pool itself, donors are jars pulled down to lift the pool, there is no pool-as-its-own-donor and no `targetJarId`.
- **`useAutoFund` (`src/state/use-auto-fund.ts`)** is the one shared write path — both the transfer-confirm flow and a plain over-budget categorize/refund event call it, so the funding + rebalance mechanic lives in exactly one place (DRY). It wraps the pure core (`src/lib/auto-fund-core.ts`) around `evaluateFunding`:
  - `assess` — pre-commit verdict on a trigger-date snapshot (never the possibly-stale popup-time one).
  - `commit` — writes **one `dieu-chinh-hu` `Transaction` per JAR donor** (`addManualTxn`, through the existing manual-txns store/API — no separate table); the **pool** donor writes nothing, since the pool is derived and already self-shrinks once the outward account debit lands. All legs are written in one pass; a mid-write failure compensates by removing the legs already created (atomic, no half-funded jar).
  - `fundJar` — funds a jar that went over-budget purely from a label/categorize action (no transfer involved).
  - `reconcile` — unwinds and re-funds a trigger txn's rebalance legs after it is refunded, re-amounted, or re-categorized (shrink/grow/remove, never a blanket delete).
  - There is deliberately **no `undo` / `changeSource`** (both removed along with `AutoFundSwapSheet` and `state/auto-fund-swap.ts`). Once legs are written the only correction is `reconcile` via the trigger txn — no surface edits a leg directly, so a rebalance can never be re-sourced behind the engine's back.
- **UI — two surfacing points, both reading straight off `FundingAssessment` (invariant #1), no independent numbers:**
  - `JarTopupSuggestionSheet` (`src/components/transfer/JarTopupSuggestionSheet.tsx`), shown from `TransferCompose.tsx` while entering the amount, previews the donor chain and offers **Đồng ý rót** (continue) or **Chọn nguồn khác** (pick a different source) — advisory only, it moves nothing. There is no "Bỏ qua, vượt hũ" escape hatch: a jar can never be knowingly left over-budget-unfunded from this screen.
  - The funding decision is actually made **assess-then-commit at `TransferConfirm.confirm()`** (`src/app/transfer-confirm/TransferConfirm.tsx`), on the freshest `financials.jarBudget.lines` and CASA balance (RT#2 — state may have drifted since the popup). `tier: "insufficient"` aborts with an error before any debit or write. Otherwise: the outward account debit runs, the **primary spend books at its FULL amount into its real category** (the source jar's first category, or the picked/agent category for a pool/account source — this overturns the retired "spread-as-spend" split), and `autoFund.commit` writes the donor rebalance leg(s) in the same action. `budgetLimit` is **never** mutated (invariant #5: no silent hạn-mức change); cancelling before "Xác nhận" writes nothing.
  - `AutoFundResultBanner` (post-confirm success screen) shows "Đã bù X từ `<donor>` → `<target>`". It is **read-only** — a pure presentational component with no state and no `useAutoFund` access. The earlier **Hoàn tác** / **Đổi nguồn** actions were removed with the undo/swap mechanic; a rebalance is corrected by re-categorising the trigger txn (`reconcile`), not from this banner.
  - `JarRebalanceLines` (`src/components/budget/JarRebalanceLines.tsx`), mounted per jar in the Ngân sách detail, renders each `dieu-chinh-hu` txn touching that jar as a read-only "← Nhận .../→ Chuyển ..." line, tagged "tự động" when `origin: "auto"` — presentational only, never mutates `spent`.
- **Retired: "spread-as-spend."** The earlier top-up mechanic wrote one **self-reported expense transaction per contributing jar, charged into that jar's own real category** (`addManualTxn` per donor into `categoryIds[0]`) — including the source jar's own portion — so recording the spend against each jar's category was what drew its derived balance down. This inflated spend-by-category for every donor even though the money was never actually spent in that category. It has been fully replaced by the rebalance-as-Transaction model above: the real spend keeps its real category (spend-by-category is honest), and inter-jar coverage moves only `remaining` via the separate `dieu-chinh-hu`-tagged leg(s). The earlier idea of a dedicated `JarRebalance`/`jar_rebalances` ledger table was also dropped in favor of riding the existing self-reported rows of `transactions` — no new table.
- **Over-allocated residual, never silently zeroed (invariant #6).** `jarNeedsManualTopUp(remaining)` (`src/domain/engine/jar-spendable.ts`) is the durable per-jar "cần bù thủ công" condition — `remaining < 0` with no covering rebalance; it is re-derived every render (never a stored flag), so it can't drift and keeps re-surfacing until the jar is funded or the over-allocation is accepted. The sole insight for this (`src/insights/detectors/jar-overspend-covered.ts`) reports it two ways per jar, once per period: **COVERED** ("đã bù … từ …", with each donor's `origin` in the copy) when a rebalance this period funded the jar, or the **RESIDUAL** ("cần bù thủ công") when it is still unfunded — never double-alarming the same overspend as the separate `jarPressure` budget-limit warning. At the pool level, the same story is `computeUnallocatedPool`'s `overAllocated` flag (Σ `budgetLimit` over CASA, or an overspend beyond every donor's reach) — "Vượt phân bổ".
- **Server-side ceiling — one number to guard.** With spendable derived and bounded by `budgetLimit`, the only server-enforced ceiling is the Σ `budgetLimit` ≤ CASA cap (`fitsCasaCap`, see "Cap enforcement" above under the envelope model), on the two `PATCH` write doors. There is no separate spendable-balance cap anymore (the retired `fitsActualCap` is gone) because a jar no longer stores a balance to cap.

### "Chưa gắn nhãn" (unlabeled spend) overview widget — implemented

A small data-quality prompt layered on the Hũ chi tiêu row, independent of the jar/envelope model above.

- **Single selector, no duplicate logic (invariant #2).** `selectUnlabeledSpend(txns, period)` (`src/domain/engine/unlabeled-spend.ts`) is the one selector behind both surfaces: posted-only (`status === "posted"`), in-period (`inPeriod`), and either an unclassified expense (`isUnclassified`) **or** an app-made (`source: "self_reported"`) outgoing transfer still tagged the structural `transfer` category. A queued transfer stays `type: "transfer"` — excluded from cashflow/jar spend (invariant #6) — and only becomes a spend when the user labels it, which flips it transfer→expense on the stored record (`UnlabeledSpendSheet` does this via the manual-txn store, since a corrections overlay cannot change `type`). Bank-history transfers (`source: "mock"`, also `categoryId: "transfer"`) are deliberately excluded so the queue is not flooded. `UnlabeledSpendCard` reads its `count`/`amount`; `UnlabeledSpendSheet` re-runs the same selector for `items` — parity by construction, they can never diverge. Composed once into `Financials.unlabeled` (`finance-compose.ts`) and rendered by `HuOverviewRow` even when no jars exist (a labeling prompt, not a jar).
- **`Financials.unlabeled` is CLIENT-ONLY.** It is derived from correction-applied transactions, and corrections live in `localStorage` (see "Corrections seam" above) — only the client `useFinancials` hook produces the correct count. The server/AI-facade path only ever sees raw provider transactions and would over-count already-labeled spend. Do **not** wire an AI read tool to this field until corrections have a server-side representation.
- **Labeling reuses the one correction path, no new write path.** Picking a category in `UnlabeledSpendSheet` calls the same `useConfirmCategory()` (`src/state/corrections.tsx`) used by `TxnDetail`/`CategoryEditor`/`PfmTxnList` — it writes an `origin: "user"` correction, the engine recomputes on next render, and the labeled amount now counts toward that category's jar. There is no AI/consent gate on this action: it's a direct user correction, not a model call.
- **Unrelated to background auto-categorization.** `AutoCategorizeProvider` (`src/state/auto-categorize.tsx`) keeps auto-applying `≥0.8`-confidence AI/heuristic suggestions in the background as before (see "Auto-categorization" above) — this widget only surfaces what's still `UNCLASSIFIED` after that pipeline runs, and confirming here is a plain user correction like any other.

### Asset and liability module

- Manage manually declared assets and debts.
- Store valuation timestamp and confidence.
- Track debt terms and upcoming obligations.
- **CRUD (implemented, `/pfm/wealth`):** `Providers.getUserAssets` / `getUserLiabilities` (return `{records, dropped}`) plus `create/update/deleteAsset` and `create/update/deleteLiability` (`src/providers/interfaces.ts`), backed by the shared `userRecordStore<T>()`. These are **persistence-only** — `listAssets()` / `listLiabilities()` stay **seed-only** and are never also merged in the provider layer. The single merge point is `ComposeOptions.userAssets` / `userLiabilities` in `finance-compose.ts`: user records are context state (`AssetLiabilityProvider`) threaded into `computeFinancials`'s `useMemo` deps, merged with seed data for `calculateNetWorth` and `upcomingObligations` exactly once — so a mutation recomputes net worth/debt health live, with no double-count. New self-reported records carry `source: "self_reported"`; a blank valuation stays `null` (`UnknownValue`), never `0`. Validation (`src/domain/models/asset-liability-input.ts`) is the sole gate between the form and a committed record: blank/NaN/negative/over-cap and enum-checked types are blocked client-side before they can reach storage.

### Goals module

- Store target, deadline, current funding, priority, and contribution.
- Calculate required periodic contribution.
- Run deterministic completion scenarios.
- **CRUD (engine + provider implemented; the Kế hoạch tab UI was removed):** mirrors the asset/liability pattern exactly. `GoalDataProvider` (`listGoals` seed-only + `getUserGoals` + `create/update/deleteGoal`) is backed by the same `userRecordStore<GoalRecord>()`; `GoalProvider` (`src/state/goals.tsx`) is the context, `ComposeOptions.userGoals` is the single merge point (`Financials.goals = [...raw.goals, ...userGoals]`), and `useFinancials` threads it into the `useMemo` deps for live recompute. `simulateGoal` remains the engine what-if the chat tool calls (invariant #1).

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

The composed `Providers` bundle (`src/providers/interfaces.ts`) also exposes `getJarConfig()`/`createJar`/`updateJar`/`updateJars`/`removeJar`/`assignCategory`/`replaceJars` (Hũ — SQLite-backed via `/api/jars*`, not `localStorage`, see "Spending jars" above; `updateJars` is the atomic batch mutator behind "Chia ngay" — there is no separate allocation-ledger provider method any more, `budgetLimit` on `Jar` is the only number); `getCategories`/`createCategory`/`updateCategory`/`archiveCategory`/`deleteCategory` (the per-persona, user-editable category taxonomy — SQLite-backed via `/api/categories*`, see "Category taxonomy" under "Spending jars" below); and the CRUD pairs for user assets, liabilities, and goals (`getUserAssets`/`create·update·deleteAsset`, `getUserLiabilities`/`create·update·deleteLiability`, `getUserGoals`/`create·update·deleteGoal`) — persistence-only, backed by the mock adapter's shared `userRecordStore<T>()` (persona-scoped `localStorage`, versioned envelope, per-record guard). See "Shared user-record CRUD infrastructure" in the IA section for that shared strategy and the intended real-adapter mapping.

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
- **Re-categorizing draws the owning jar down through spend, not a balance write.** When a transfer is re-categorized into a category owned by a jar, the confirm screen simply records/updates the `self_reported` transaction under that category (`updateManualTxn`); the jar's spendable is derived (`max(0, budgetLimit − spent)`), so the recorded spend *is* what draws it down — there is no separate jar-balance debit/refund to keep in sync, and no `Thực tế`↔`Ngân sách` divergence to reconcile. The durable correction path on the transaction-detail screen (`TxnDetail.tsx`, via the `useCorrections` overlay) works the same way for `self_reported` records: because a category change is the only lever, re-classifying there re-routes the derived jar numbers automatically, with nothing extra to re-run.
- **"Phân loại giao dịch" on this same success card also hosts transfer-purpose suggestion** (`TransferCategorizeSection` → `TransferPurposeSuggestionBanner`, see "Transfer-purpose suggestion" under "Transaction module" above) — a separate, AI/heuristic-suggested "why" label layered on top of the category picker described here. Accepting a `spending` purpose reuses this exact `applyCategory` path (category move → derived jar draw-down); a non-spending purpose only ever writes `transferPurpose` metadata and never touches a jar.

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
- Single-number envelope identity (implemented — `src/domain/engine/__tests__/jar-envelope.test.ts`): `pending.amount === max(0, pool − Σ budgetLimit)` and `remaining === budgetLimit − spent + rebalanceNet` per jar, on fixtures — including the no-`budgetLimit` case (`remaining`/`overLimit` never fabricate a 0), the overspent (negative `remaining`) case, and the no-current-account case (pool/pending stay "unknown"), plus a determinism check (calculation-correctness gate).
- Two independent axes (implemented, plan `260920-1317-jar-transfer-balance-not-limit` — `src/domain/engine/__tests__/jar-budget-guards.test.ts`, `jar-budget.test.ts`, `jar-envelope.test.ts`): a rebalance leg that fully or partially covers an overspent jar's `remaining` never flips `status`/`overLimit` back to `"ok"`/`false` — `line.status === "over" ⇔ line.spent > line.limit` holds for every leg size in a sweep (`[0, 10k, 49_999, 50k, 50_001, 200k]`), independent of the balance axis (`jarNeedsManualTopUp(line.remaining) === (line.remaining < 0)`).
- **A jar balance is never rendered negative (implemented, UX rule — `src/components/budget/__tests__/budget-tab.test.tsx`):** every "Số dư" surface floors through `jarSpendable` (`max(0, remaining)`), so an overspent jar reads `Số dư 0` and the rendered tab contains no `-<digit>` anywhere. The uncovered amount is not lost — it moves to `ManualCoverNotice` ("đã tiêu quá số dư X chưa được bù", `X = −remaining`, the BALANCE axis) and, separately, "Đã vượt hạn mức Y" keeps stating the PLAN axis (`Y = spent − limit`). `jar-pressure`'s fact flips label instead of sign (`Còn lại` → `Cần bù`, always a positive number) — asserted on `insight.sourceFacts` in `src/insights/__tests__/jar-pressure.test.ts`, since `factValues` abs-normalises and cannot see a sign regression.
- Cap-validator test (implemented — `src/domain/engine/__tests__/allocation-plan.test.ts` for `fitsCasaCap`; `src/app/api/jars/__tests__/route.test.ts` for the two write doors): Σ `budgetLimit` never exceeds `casaPoolForCif`'s CASA pool on either write door. (The former `actualAmount` H3 re-sync and its `fitsActualCap`/`jar-rules-resync` tests were removed with the field itself — a jar carries no stored balance to cap or re-sync anymore.)
- Derived-spendable, unallocated pool, and funding-tree tests (implemented — `src/domain/engine/__tests__/jar-budget.test.ts` for `jarSpendable`, `.../unallocated-pool.test.ts`, `.../jar-funding.test.ts`): `jarSpendable` is `max(0, remaining)` and stays `null` for an unset limit (never 0, invariant #6); `casaBalance` sums only `current` accounts across multiple such accounts (never `accounts[0]`); `computeUnallocatedPool({casaBalance, spendableTotal})` never clamps a negative pool (`overAllocated` true, true negative kept); `evaluateFunding` covers `ok`/`topup`/`insufficient` tiers over `JarSpendable[]`, the donor order (pool first, then jars largest-`spendable`-first, no protected jar), the `insufficient` residual no donor set can cover, `canDonate` filtering, multi-donor chains, and the pool-as-source direction (`sourceJarId: null`) where donors lift the pool with no self-donation and no target jar.
- Rebalance-as-Transaction fold (implemented — `src/domain/engine/__tests__/jar-rebalance.test.ts` for `rebalanceNetByJar`/`rebalanceTxns`): only posted, in-period, `REBALANCE_CATEGORY`-tagged txns with `rebalance` meta count; `Σ nhận − Σ cho` folds correctly per real jar; the `"pool"` end of a leg is never credited/debited as a bucket (never reintroduces `pool + Σ remaining`); `spent` stays untouched by any rebalance (invariant #6).
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
