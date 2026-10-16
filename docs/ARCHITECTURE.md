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

The mobile-first UI is a **3-tab MSB banking layout** (`src/components/shell/BottomNav.tsx`), replacing an earlier 5-tab PFM layout, so navigation matches the real MSB app. This is a presentation-layer reshuffle only — it does not change the module responsibilities, canonical models, or provider contracts below.

```text
src/app/
  page.tsx                 Home ("Trang chủ") — hero header, primary account
                            card, quick actions, promos/insights
  accounts/page.tsx         Tài khoản tab: account list
  accounts/[id]/page.tsx    Account detail: header + scoped transaction list
  transactions/page.tsx     All-transactions view (shared list component)
  pfm/page.tsx              PFM hub: net worth + cashflow summary +
                            obligations + entry cards
  pfm/cashflow/page.tsx     Cash Flow detail (extracted CashflowView)
  pfm/wealth/page.tsx       Wealth detail (extracted WealthView)
  pfm/insights/page.tsx     Insights detail
  cashflow/page.tsx         Redirect -> /pfm/cashflow (legacy route kept alive)
  wealth/page.tsx           Redirect -> /pfm/wealth (legacy route kept alive)
  settings/page.tsx         Consent scope + revoke, persona switcher, About
  assistant/                AI Assistant chat screen
  transfer-confirm/         Native MSB transfer confirmation (draft handoff)
```

Key shared components introduced by the refactor:

- `src/components/shell/BottomNav.tsx` — 3 tabs (Trang chủ `/`, Tài khoản `/accounts` + `/transactions`, PFM `/pfm`); active-tab matching is prefix-based per tab.
- `src/components/shell/AssistantFab.tsx` — floating action button (Sparkles icon) rendered above the tab bar on every screen except `/assistant`, linking to `/assistant`.
- `src/components/home/*` (`AccountSummaryCard`, `HomeQuickGrid`, `PromoCarousel`, `PromoCard`, `Dots`) — Home-specific presentation, not reused elsewhere.
- `src/components/transactions/TransactionListSection.tsx` — shared transaction list, used by both `/transactions` (all accounts) and `/accounts/[id]` (scoped via an `accountId` filter prop).
- `src/components/cashflow/CashflowView.tsx` and `src/components/wealth/WealthView.tsx` — cash flow and wealth detail views extracted out of the old top-level screens so `/pfm/cashflow` and `/pfm/wealth` render them directly; obligations, previously on Home, now live on the PFM hub (`src/app/pfm/page.tsx`) only.
- `src/components/pfm/PfmHubNav.tsx` — entry cards from the PFM hub into Cash Flow / Wealth / Insights.
- `src/lib/format.ts` (`maskAccountNumber`) — masks an account number to its last 4 digits for display (e.g. `•••• 1991`); used by the Home account card and account list/detail headers. Presentation-only; does not touch the calculation engine or provider data.
- `src/lib/transfer-draft-store.ts` — session-scoped (`sessionStorage`) hand-off of a `TransferDraft`'s display fields (name, masked account, amount, memo, source label) from the chat `DraftCard` to `/transfer-confirm`, keyed by draft id. The draft's PII/financial fields never travel in the URL query string — only the `draftId` does. No account number (only the masked form) is ever stored, and nothing in this module executes a transfer; it purely carries display state across the client-side navigation boundary, consistent with the `TransferDraft` model and pipeline in "Tier B — draft-only tools" below.

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

### Balance-sheet module

- Aggregate assets and liabilities.
- Calculate net worth and net-worth trend.
- Keep source and freshness metadata.
- Distinguish verified, self-reported, and estimated values.

### Asset and liability module

- Manage manually declared assets and debts.
- Store valuation timestamp and confidence.
- Track debt terms and upcoming obligations.

### Goals module

- Store target, deadline, current funding, priority, and contribution.
- Calculate required periodic contribution.
- Run deterministic completion scenarios.

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

`computeFinancials` was extracted from the React data hook into `src/domain/engine/finance-compose.ts` so the server-side AI pipeline calls the **same deterministic engine** the UI renders from — the AI never becomes a second source of financial truth (invariant #1). Two new pure simulation engines back the what-if tools:

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
