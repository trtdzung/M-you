# MSB AI Personal Financial Management

## Overview

Working name: **MSB Financial Copilot**

Purpose: help MSB customers understand their financial position, control cash flow, and make better next-step decisions through a trustworthy personal financial management experience.

This product extends the public direction of MSB Digital Bank toward an intelligent personal financial assistant while treating security, consent, transparency, and user control as first-class product requirements.

## Product thesis

Users need one place to answer four questions:

1. How much money do I have?
2. Where is my money going?
3. Will my cash flow be healthy at the end of the month?
4. What should I do next?

The product is a financial cockpit, not a generic chatbot. Deterministic financial calculations are the source of truth; AI explains patterns, answers questions, and produces bounded simulations.

## Target users

### Primary persona

Retail MSB customer with salary income, multiple accounts/cards, recurring bills, and limited time to review personal finances.

Typical needs:

- Understand spending without maintaining a spreadsheet.
- Avoid cash-flow surprises.
- Build emergency savings.
- See debts and assets together.
- Make decisions based on goals rather than random product offers.

### Secondary personas

- Young professionals starting to invest.
- Customers with several MSB products and fragmented financial visibility.
- Mass-affluent customers who want a lightweight financial overview before meeting an advisor.

## Product principles

- **Visibility before advice:** complete and understandable data comes before recommendations.
- **AI as copilot:** AI explains and simulates, and can *prepare* a transaction draft for review (assisted transfer drafting); it never becomes the financial ledger, and never executes, confirms, or authenticates a transaction. The human is always the one who presses send and enters the OTP.
- **Progressive disclosure:** Level 1 is useful on its own; Level 2 and Level 3 unlock as data and user trust improve.
- **Explain every number:** show source, freshness, assumptions, and whether a value is estimated.
- **User correction improves the product:** category edits, asset updates, and feedback are explicit product actions.
- **Objective before cross-sell:** recommendations must be tied to a stated goal and constraints.

## Scope by PFM level

| Level | User outcome | Included capabilities | AI role |
|---|---|---|---|
| 1. Money visibility | Understand daily money movement | Transactions, categories, cash flow, budgets, recurring payments, basic net worth | Summary, anomaly detection, explanations |
| 2. Wealth picture | Understand assets, debts, and resilience | Assets, liabilities, goals, allocation, debt health, emergency fund | Analysis, projections, prioritization |
| 3. Guided decisions & assisted actions | Choose a sensible next action and act on it safely | Surplus allocation, debt-vs-saving scenarios, goal planning, investment education, product discovery, assisted transfer drafting | Bounded recommendation, scenario explanation; prepare transfer draft for human review/confirm/OTP |

## Level 1: Money visibility

### Transaction management

- Unified feed for mock MSB current accounts, savings, and credit cards.
- Search, date filter, account filter, amount filter, and category filter.
- Merchant normalization.
- Income, expense, transfer, refund, fee, and card-payment transaction types.
- Category assignment with user correction.
- Recurring transaction detection.
- Internal transfers excluded from income and expense totals.
- Clear status for pending, posted, refunded, and reversed transactions.

### Cash flow

- Daily, weekly, and monthly views.
- Income versus expense.
- Fixed versus discretionary expense.
- Category contribution to total spend.
- Upcoming recurring obligations.
- End-of-month cash estimate.
- Month-over-month comparison.

### Hũ chi tiêu (spending jars) — implemented

Hũ is **a category-grouping budget model**, delivered by the BIDV-style wallet reformat (`plans/260910-1626-pfm-bidv-wallet-reformat/`), which **retired** the earlier balance-lens partition (a jar as a `%`/fixed-VND slice of the current account balance, `Σ earmarks + "Chưa phân bổ" ≡ số dư`) described in earlier revisions of this document — that design shipped, ran for one release, and was superseded. Fully deterministic, no AI in the calculation path.

- **A jar is a group of expense categories with an optional monthly limit.** A jar earmarks nothing and never holds or moves money; it groups categories and, optionally, caps their combined monthly spend (`budgetLimit`, VND/month).
- **Every expense category belongs to exactly one jar.** An orphaned category (a stale config, a bad migration) heals into a catch-all **"Khác"** jar rather than silently dropping out of totals — a defensive fallback, not a normal assignment path.
- **A limit stays unknown until the user sets it — never coerced to 0.** A jar with no limit renders "Chưa đặt hạn mức" with a CTA, never a false 0%/"ok" bar (invariant #6). A savings-type jar with no categories assigned has no meaningful spend to limit, so it also stays unset by design (the seed templates leave it that way).
- **Ngân sách is the budget truth**, computed per jar for the selected month: **đã tiêu** vs **hạn mức**, a progress bar, a "Vượt hạn mức" warning at and above the limit, an 80% near-threshold warning, and a month-over-month delta — plus a total gauge (limits vs. spend) computed only over jars that have a set limit. The same per-jar numbers back the spending donut on Tổng quan.
- **Reachable as its own bottom-nav tab** ("Ngân sách") — see "Information architecture" below — with a reserved (empty-state) "Thu" sub-tab for a future income/goal view.
- **The insight layer warns per-jar only.** `jarPressure` (over-limit / near-limit per jar) is now the product's **sole** budgeting warning; the earlier per-category budget-pressure warning was retired in the same change to avoid warning the user twice about the same overspend. The underlying per-category budget engine is **retained as AI-facing structured data**, not as a competing warning.
- **Setup and edits live in Cài đặt → "Hũ & danh mục":** create/edit/delete a jar (name, color, icon, monthly limit — deleting a jar force-moves its categories to "Khác" first, so none are ever orphaned) and reassign a category to a different jar (exactly-one is enforced: assigning drops it from the old jar automatically). Preset categories are locked (cannot be renamed or deleted); a duplicate jar/category label is flagged with a warning. **Creating a brand-new category is not yet shipped** — a known, deliberate limitation, deferred pending a change to how the category taxonomy is stored.
- **Onboarding (implemented):** a one-screen first-run setup — pick a seed jar template (Cá nhân: 6 hũ, default; Gia đình: 4 hũ; Kinh doanh: 3 hũ) and review the accounts pulled from the account provider, then start. Template limits are suggested (labelled `estimated`) and fully editable afterward in Cài đặt. Shown once per install; every later visit skips straight to Tổng quan.
- **Envelope allocation — "Hũ chi tiêu" row trên Tổng quan (implemented).** A horizontally-scrolling row on the Tổng quan cockpit layers an income→jar *envelope* on top of the budget model above. A **"Chờ phân bổ"** card shows the current period's posted income not yet split into a jar, with the exact count of income transactions "chưa vào hũ" (ledger-keyed to concrete `txnId`s, never a proxy over a pooled sum), plus a **"Chia ngay →"** bottom sheet that lets the user split that income into jars. Each jar card then shows **"còn lại trong hũ" = nạp kỳ này (funded) − đã tiêu kỳ này (spent)** — both engine-derived from an allocation ledger, never from a stored balance — so it can read negative (overspent, shown honestly) or "Chưa có số dư" (not funded this period, never a fabricated 0₫), with an "ĐANG DÙNG" badge once a jar is funded. This is **pure bookkeeping of money already sitting in the user's accounts**: no transfer, no OTP, no money movement (invariant #3), and the stored jar `actualAmount` (the Chuyển-tiền spendable balance) is completely untouched — no migration, backfill, or reset was needed.
- **Not a revival of the retired balance-lens residual, and not the orphaned surplus engine below.** This envelope concept is a **new, independent** income→jar ledger, scoped per period — it is neither a resurrection of the "Model A" balance-partition jar retired above, nor a rewiring of the orphaned `simulateSurplusAllocation`/`surplus.ts` engine described in the next bullet, which remains untouched and still has no mount point.
- **Two "còn lại" meanings now coexist, both explainable.** Ngân sách tab: "còn lại" = **hạn mức − đã tiêu** (limit minus spend). Tổng quan envelope card: "còn lại" = **nạp − đã tiêu** (funded minus spend). Both subtract the same "đã tiêu" figure and differ only in the baseline (a configured limit vs. money actually allocated this period); the Overview card carries a short subtext so the two readings don't read as contradictory.
- **Level 3 surplus allocation is currently orphaned, not shipped in this model.** The deterministic "phân bổ thặng dư" what-if sourced its number from the retired balance-partition's "Chưa phân bổ" residual, which no longer exists. The calculation engine and its tests still exist, but its UI was removed with the rest of the retired balance-lens screens and it has no data source in the new model — it is unwired pending a future redefinition of "surplus" (e.g. against monthly cashflow instead of a balance residual).

### Basic net worth

```text
Net worth = total assets - total liabilities
```

Level 1 includes MSB-held cash and known liabilities. External assets are deferred to Level 2 and must be labelled as self-reported when introduced.

### AI insights

Examples:

- “Chi tiêu ăn uống tăng 24% so với tháng trước.”
- “Hũ Giải trí đã tiêu vượt hạn mức tháng này.”
- “Khoản thanh toán thẻ lớn nhất sẽ đến sau 5 ngày.”
- “Có một khoản chi lặp lại mới xuất hiện trong 3 tháng gần đây.”

Every insight must link to the underlying transactions or calculation and show the comparison period.

## Level 2: Wealth and liabilities

### Assets

Support MSB-held and manually declared assets:

- Cash and current account.
- Term deposit.
- Mutual fund.
- Stock.
- Gold.
- Real estate.
- Vehicle.

Each external or manual asset has `lastUpdatedAt`, `source`, `isEstimated`, and an optional note. The UI must not present a manually entered value as a bank-verified balance.

**Manual manager (implemented, `/pfm/wealth`):** users add, edit, and delete self-reported assets/liabilities directly; every user record carries `source: "self_reported"` and a per-row freshness/provenance chip, and a blank valuation renders as unknown, never `0₫`. Seed (mock) records stay read-only and shown separately.

### Liabilities

- Credit card balance.
- Personal loan.
- Mortgage.
- Instalment plan.
- Other manually declared debt.

Show principal, interest rate when known, minimum payment, due date, and remaining term. Missing fields are shown as unknown rather than guessed. Manual create/edit/delete is implemented in the same `/pfm/wealth` manager as Assets above.

### Goals

Initial goal templates:

- Emergency fund.
- Travel.
- Home purchase.
- Education.
- Retirement.
- Custom goal.

Each goal has target amount, target date, current amount, monthly contribution, priority, and funding source.

**Manual manager (engine + components implemented; UI currently unmounted):** users create, edit, and delete goals (name, target amount, target date, optional monthly contribution); each goal supports a direct-tap what-if projection (live contribution slider) that returns the identical result as the chat assistant's `simulateGoal` tool. This lived on a **Kế hoạch** tab that no longer exists in any revision of the `/pfm` tab bar (removed in the earlier 3-tab reformat, `plans/260909-2254-pfm-3tab-reformat/`, and not reintroduced by the later 4-tab wallet reformat) — the CRUD logic, `GoalProvider`, and `simulateGoal` parity test are all intact and unaffected; only the screen mount point is gone (`// DEFERRED:` banner on `PlanTab`), pending a re-mount somewhere in the current IA (a future "Thu" tab is one option under discussion, not committed).

### Financial health indicators — engine implemented; UI deferred

Use several explainable indicators instead of one authoritative score:

- Monthly surplus.
- Essential-expense coverage.
- Cash runway.
- Debt-to-income ratio.
- Emergency-fund progress.
- Concentration of assets and liabilities.

Each indicator is `null` (rendered as `—`) rather than defaulted to zero when its inputs are missing. The `HealthPanel` UI (all six indicators) lived on the same now-retired Kế hoạch tab as Goals above and remains unmounted; `Financials.health` composition is unaffected and unchanged. Only its runway figure has a separate display today, as a "Khả năng trang trải" KPI tile on the Tổng quan cockpit — the other five indicators have no display outside the still-unmounted `HealthPanel`.

## Level 3: Guided decisions

### In prototype scope

- Surplus allocation between spending, emergency fund, debt repayment, and savings.
- Debt repayment scenarios.
- Saving versus investing scenarios.
- Goal completion projection.
- Risk-profile questionnaire.
- Education-oriented investment allocation examples.
- Eligibility-aware product discovery using mock products.
- **Assisted transfer drafting**: the agent prepares a transfer draft; the human reviews, confirms, and authenticates. Feature-gated by `ENABLE_TRANSFER_DRAFTING` (default on in the prototype); when off, transfer requests are refused as before.

### Structured transfer entry (implemented)

The Home **Chuyển tiền** entry opens a deterministic, single-screen form. A recipient can only come from a saved beneficiary, the user's transaction history, or a user-entered 8–19 digit account number. The form stores and displays only a masked number, warns for a new payee or amount at the shared transfer threshold, and creates a local mock draft. It never invokes the AI facade; it converges with assisted drafting at the same editable mock confirmation screen.

### Assisted transfer drafting (implemented, `EPIC-13`)

The read/explain/simulate assistant described in the AI product contract above is implemented. This subsection describes assisted transfer drafting, also implemented. When the `ENABLE_TRANSFER_DRAFTING` flag is off, the assistant refuses any transfer request and points the user to the native MSB transfer flow, exactly as before this feature shipped.

The agent can help the user *set up* a transfer, but stops strictly at the draft. It is a **write-intent, not a write**.

The agent may:

- Produce a **TransferDraft**: recipient, amount, memo/content, and (optionally) source account.
- Resolve the recipient from saved beneficiaries, explicit user input, or the user's own transaction history (e.g. "chuyển cho chủ nhà như tháng trước") — always using a **real account number from an existing record, never fabricated**.
- Ask to disambiguate when the recipient, amount, or account is unclear, instead of guessing.
- Warn and require an in-chat re-confirmation when the amount exceeds a configured threshold, or when the draft looks risky (see fraud checkpoint).
- Hand the completed draft off to the native MSB transfer confirmation screen, with every field visible and editable.

The agent must not:

- Execute, submit, confirm, or schedule the transfer.
- Handle, request, or bypass OTP, password, or any authentication.
- Invent, complete, or alter a recipient account number.
- Move money without the human reviewing every field and authenticating in the MSB flow.

**Fraud checkpoint (trust feature):** the agent actively flags high-risk drafts — new/unknown payee combined with a large amount and urgency language ("gấp", "ngay") — and asks the user to slow down and re-confirm before drafting. This turns the assistant into a social-engineering circuit breaker rather than an attack vector.

Every draft is written to the AI audit log (fields, recipient source, risk flags, threshold hits), but the audit never stores credentials or OTP.

### Explicitly out of scope for the first prototype

- Autonomous transfer, purchase, or sale (the agent may draft, but never execute — execution is always the human plus OTP).
- Guaranteed return or certainty language.
- Specific security price prediction.
- Advice based on incomplete or stale data without disclosure.
- Presenting product promotion as objective financial advice.
- The agent touching OTP, credentials, or the confirm/execute action of any flow.

All real actions must hand off to an existing MSB transaction flow and require explicit user confirmation and authentication.

## Core user flow

```text
PFM entry
  -> consent and data scope
  -> financial overview
  -> transactions / cash flow / net worth
  -> assets and liabilities
  -> goals and financial health
  -> AI insight or user question
  -> simulation or recommendation
  -> review assumptions
  -> (optional) agent prepares a transfer draft
  -> user reviews every field
  -> explicit confirmation + OTP/authentication in the native MSB flow
  -> existing MSB action flow executes
```

## Information architecture (implemented)

The prototype ships a **3-tab MSB banking layout** at the app level, matching the real MSB app rather than a generic 5-tab layout. Inside the PFM sub-app, the IA was organized around MSB's four product-thesis questions across 4 top-tabs (`plans/260909-1519-pfm-benchmark-ia-redesign/`), then reformatted to a 3-tab spine (`plans/260909-2254-pfm-3tab-reformat/`), then reformatted again to a **BIDV-style wallet layout** — a 4-tab bottom nav with a center add-transaction FAB (`plans/260910-1626-pfm-bidv-wallet-reformat/`), which **supersedes both earlier PFM tab layouts** and is the one shipped today:

| Tab | Route(s) | Purpose |
|---|---|---|
| **Trang chủ** (Home) | `/` | MSB-style home: hero header, primary account card, quick actions, promos/insights. Not a PFM dashboard. |
| **Tài khoản** (Accounts) | `/accounts`, `/accounts/[id]`, `/transactions` | Account list → account detail (with per-account transactions) → all-transactions view. |
| **PFM** | `/pfm` (single route, client-side tabs via `?tab=`) | The wallet sub-app: a 4-tab bottom nav — **Tổng quan · Giao dịch · Ngân sách · Cài đặt** — plus a center **＋ FAB**, all switched client-side with no navigation or refetch. |

Inside `/pfm`, the four bottom-nav tabs are:

- **Tổng quan** (`?tab=overview`) — the no-scroll-first "4-question cockpit": hero net worth, a 2×2 KPI grid, the top-severity insight, a `NetWorthSummary` drill tile to `/pfm/wealth`, and — folded in from the retired Dòng tiền tab — the spending donut (grouped by hũ, MoM delta) and 6-month cashflow trend, with a "Xem chi tiết báo cáo" CTA opening the detailed spending report in a sheet.
- **Giao dịch** (`?tab=transactions`) — a PFM-scoped transaction list grouped by day with category chips; unclassified transactions are highlighted. Tapping a transaction opens its detail: category picker (always with a jar, since every category belongs to exactly one jar), and a "hide from report" toggle.
- **＋ (center FAB)** — not a tab; opens the manual "Thêm giao dịch" form (amount, direction, category, note; always `source: self_reported`; never executes or moves money — invariant #3). This FAB **replaces the Assistant FAB inside `/pfm`** — see below for where the AI assistant is reached from instead.
- **Ngân sách** (`?tab=budget`) — the per-jar budget truth: a total gauge plus one card per jar (spent/limit, progress, "Vượt hạn mức" warning), described under "Hũ chi tiêu" above.
- **Cài đặt** (`?tab=settings`) — "Hũ & danh mục": jar CRUD and category reassignment, described under "Hũ chi tiêu" above. This is scoped to jars/categories only; it is **not** the same screen as the app-level `/settings` (consent, persona switcher, About — see below), which keeps its separate route and entry point.

**Tài sản & Nợ** is not a tab — it is a manual asset/liability manager at `/pfm/wealth`, drilled into from the `NetWorthSummary` tile on Tổng quan (one tap) or the `open-wealth` copilot intent.

**Kế hoạch** and **Trợ lý**, the two tabs dropped in the earlier 3-tab reformat, remain absent from this 4-tab wallet IA too — they were not reintroduced. This stays a **UI-unmount only**: the deterministic engine behind them (goal CRUD/composition, `simulateGoal`, `financialHealth`), the AI facade, and every related test remain intact; only the screen mount points (`PlanTab`, `AssistantTab`) stay dropped, each still carrying a `// DEFERRED:` banner (see `plans/project-backlog.md` for the deferred inventory). The Level 3 surplus-allocation engine (`simulateSurplusAllocation`) additionally lost its data source in this reformat — see "Hũ chi tiêu" above.

The floating **Assistant FAB** (sparkle icon, links to `/assistant`) now renders only on the top-level Trang chủ/Tài khoản screens, not inside `/pfm` (whose center FAB is dedicated to adding a transaction). The assistant chat's empty state (no messages yet) still surfaces the rule-based insights feed (`InsightsView`) inline. The FAB, suggested prompts, and every advisory "nên làm gì" CTA all route through the same deterministic whitelist (`resolveIntentRoute`, `src/lib/copilot-nav.ts`) as tappable links — never an auto-navigation. **Settings** (`/settings`) is not a tab — it holds consent scope + revoke, the demo persona switcher, and About, and is reachable in at most two taps (tap the account tier row on the account card, or navigate directly to `/settings`).

Legacy routes `/cashflow`, `/wealth`, `/pfm/cashflow`, `/pfm/jars`, and `/pfm/insights` still exist as thin redirects (`/wealth` → `/pfm?tab=overview`, `/pfm/jars` → `/pfm?tab=budget`, `/pfm/insights` → `/assistant`); a stale `?tab=hu` or `?tab=cashflow` (including the old `?tab=cashflow&dock=hu` combo) normalizes forward to the new tab ids (`hu`→`budget`, `cashflow`→`overview`), and any other unrecognized `?tab=` value falls back to `overview`. So old links, bookmarks, and copilot deep links keep working. `/pfm/wealth` is a real page, not a redirect — it is the Tài sản & Nợ manager.

Provenance pills (the small MSB/Tự khai/Ước tính/Demo source badges) are **hidden app-wide by product decision** — in an all-mock demo they read as debug clutter on nearly every value. The underlying provenance data model is unchanged (every value still carries `source` and freshness per invariant #5); only the visible chip is switched off, toggleable in one place (`SourceBadge`).

### Masked account number (implemented)

The primary account card on Home shows a display-safe, masked account number (e.g. `•••• 1991` — last 4 digits only, non-digits stripped) rather than the full number, with the balance hidden by default behind an eye toggle. This is a presentation-only decision: the full account number is never carried on the UI-facing account model, and masking has no effect on provenance or the calculation engine.

## Primary screens

1. **Home (Trang chủ):** hero header, primary account card (masked number, hide/show balance, tier as marketing metadata only), quick-action grid, promo carousel with a top insight surfaced inline. Obligations are not shown here — they live on the PFM Overview cockpit.
2. **Tài khoản (Accounts):** account list → account detail with a scoped transaction list; a shared "all transactions" entry point.
3. **PFM (`/pfm`):** single route, 4-tab bottom nav + center FAB (`plans/260910-1626-pfm-bidv-wallet-reformat/`). First run shows a one-screen onboarding (template picker + tracked-account review) instead — see "Hũ chi tiêu" above.
   - **Tổng quan:** a no-scroll-first "4-Question Cockpit" — hero net worth (with delta badge and sparkle trend), a 2×2 KPI grid (Dòng tiền tháng, Cuối tháng estimate, Sắp phải trả, Sức khỏe/runway), the single top-severity insight, a `NetWorthSummary` drill tile (one tap → `/pfm/wealth`), and — folded in from the retired Dòng tiền tab — a spending donut grouped by hũ with a MoM comparison, a 6-month cashflow trend chart, and a "Xem chi tiết báo cáo" CTA opening a donut + per-jar/category breakdown sheet. Always the current month — there is no PeriodPicker on this tab, by design (the end-of-month projection is only valid when "now" is inside the displayed month).
   - **Giao dịch:** a day-grouped transaction list with category chips (unclassified transactions highlighted); tap-through to a detail screen with a category picker (always with a jar) and a "hide from report" toggle.
   - **＋ FAB:** opens the manual "Thêm giao dịch" form (self-reported, never executes money movement).
   - **Ngân sách:** the per-jar budget truth — total gauge + one card per jar (spent/limit, progress, "Vượt hạn mức" warning, MoM delta) — see "Hũ chi tiêu" above.
   - **Cài đặt:** "Hũ & danh mục" — jar CRUD (name/color/icon/monthly limit/delete) and category reassignment — see "Hũ chi tiêu" above. Distinct from the app-level Settings screen (item 5 below).
   - **Kế hoạch and Trợ lý (still not mounted anywhere in `/pfm`):** Mục tiêu CRUD + per-goal what-if, the surplus what-if panel, and the 2×2 financial-health panel (formerly Kế hoạch), and the copilot entry + suggested prompts + insights feed (formerly Trợ lý). The underlying engine, providers, and tests are untouched; the components (`PlanTab`, `AssistantTab`) carry `// DEFERRED:` banners. The insights feed surfaces inside the `/assistant` chat's empty state instead.
4. **Tài sản & Nợ (`/pfm/wealth`):** a manual manager — add/edit/delete self-reported assets and liabilities, net-worth strip, read-only seed section, provenance + freshness per row (provenance data unchanged; the visible pill is hidden app-wide — see "Information architecture" above). Drilled into from Tổng quan or the `open-wealth` copilot intent; not a tab.
5. **Settings (app-level, `/settings`):** consent scope view + revoke, demo persona switcher, About — reachable from the account card, not a tab. Not to be confused with the PFM "Cài đặt" tab above, which only manages hũ and categories.
6. **AI Assistant:** free-text streaming chat grounded on live financial data — explain-this-month, spending/obligations/net-worth questions, goal and debt what-if simulations, source-chip provenance per answer. Assisted transfer drafting (draft → review → hand off to MSB confirm + OTP) is implemented, feature-gated by `ENABLE_TRANSFER_DRAFTING`; transfer requests fall back to a plain refusal when the flag is off. Reached via the Assistant FAB on Trang chủ/Tài khoản (no longer inside `/pfm`, whose FAB now adds transactions).

### Báo cáo tư vấn (monthly advisory brief) — implemented but currently unreachable in the UI

A rule-based monthly brief (`ReportBriefSheet` / `composeMonthlyBrief`): positives, risks, and behavioral highlights drawn from the existing insight detectors and cashflow facts, each with evidence, a magnitude band, and templated "nghĩa là gì" (what it means) / "nên làm gì" (what to do) Vietnamese copy, with every "nên làm gì" a tappable deep-link CTA through the same whitelisted `resolveIntentRoute` used by the copilot FAB. **This brief lost its only mount point** (`CashflowChartView`, the old Dòng tiền tab) when the wallet reformat folded that tab's content into Tổng quan — the "Xem chi tiết báo cáo" CTA on Tổng quan now opens the plainer donut/breakdown sheet (`SpendingReport`), not this advisory brief. The engine, component, and tests remain intact and green; re-wiring a CTA to it is pending future work.

**This brief is fully deterministic/templated — there is no LLM in this pipeline.** LLM narration of the brief was scoped for an earlier redesign but deliberately deferred (prompt-injection, timeout, and pipeline-shape risk were judged not worth taking before the new IA is validated with users); see `EPIC-07`/`PFM-062` in `plans/project-backlog.md`.

## AI product contract

**Status:** implemented and live for the read/explain/simulate capabilities below, grounded on a real LLM (Anthropic by default) with an offline fallback when no key is configured. Assisted transfer drafting is also implemented (see "Assisted transfer drafting" under Level 3), feature-gated by `ENABLE_TRANSFER_DRAFTING` (default on in the prototype).

The assistant may (implemented):

- Summarize structured PFM facts, grounded on the same deterministic engine as the rest of the app.
- Call read-only financial calculators and deterministic what-if simulators (cash flow, spending by category, upcoming obligations, net worth, goal projection, debt payoff).
- Explain changes and trade-offs.
- Ask for missing information instead of guessing (e.g. no goals created yet).
- Generate bounded, deterministic scenarios (goal/debt what-if).

The assistant may not, and today cannot (enforced in code, not just prompted):

- Invent balances, transactions, rates, or market data — every displayed number must trace back to a tool result, or the answer is suppressed in favour of a safe "not sure" reply.
- Override deterministic calculations.
- Hide uncertainty or data freshness.
- Execute, submit, confirm, or authenticate a financial action, or handle OTP/credentials, under any circumstance.
- Invent or complete a recipient account number, or move money without explicit user confirmation and authentication in the native MSB flow.
- Phrase a projection as a guaranteed outcome, or claim it already performed a transaction.

The assistant may (implemented, Level 3, assisted transfer drafting): *prepare* a transfer draft (prefill recipient, amount, memo, source account) for the user to review, confirm, and authenticate, feature-gated by `ENABLE_TRANSFER_DRAFTING`. When the flag is off, any transfer-intent request is refused outright, with no draft produced.

## Mock-data strategy

The prototype uses realistic but synthetic data:

- One sample customer with salary income.
- Two current accounts, one savings account, one credit card.
- Six months of transactions.
- Recurring rent, utilities, subscriptions, salary, and debt payment.
- Manually entered fund, gold, vehicle, and personal loan.
- Mock product catalogue for savings and investment scenarios.

Mock records must carry `source: mock` and be replaceable through data-provider interfaces.

## Success metrics

### Product metrics

- PFM onboarding completion.
- Weekly active PFM users.
- Percentage of users opening at least one insight.
- Transaction categorization correction rate.
- Goal creation and monthly return rate.
- Simulation completion rate.
- Recommendation save, dismiss, or act-on rate.

### Quality and trust metrics

- Calculation correctness: 100% against test fixtures.
- AI numerical grounding: 100% of numeric claims trace to structured facts.
- Insight feedback: helpful versus not helpful.
- Correction resolution rate.
- Stale-data disclosure rate.
- Zero unauthorised action execution: the agent has no execute/confirm/authenticate capability, whether or not transfer drafting is enabled.
- Zero transfers executed by the agent (100% of executions performed by the human with OTP), zero fabricated recipient account numbers in drafts, transfer-draft acceptance/edit/abandon rate.

## Main risks and mitigations

| Risk | Mitigation |
|---|---|
| Wrong categorization reduces trust | Allow correction, show confidence, learn from corrections |
| Partial financial picture | Show coverage, missing data, and data freshness |
| Hallucinated financial answer | Tool-only calculations, schema validation, grounding checks |
| Advice interpreted as promise | Scenario language, assumptions, downside, no guarantee |
| Cross-sell bias | Goal-first ranking and transparent reason codes |
| Privacy concern | Granular consent, data minimization, audit trail, deletion/export path |
| Insight fatigue | Digest limits, severity tiers, dismiss/snooze controls |
| Social engineering / prompt injection into a transfer draft | Recipient account numbers never fabricated (saved/typed/history only); amount-threshold re-confirmation; fraud checkpoint on new-payee + large + urgency; agent never executes or handles OTP; full draft audit |

## References

- [MSB Digital Bank: Quản trị tài chính cá nhân bằng tư duy số thế hệ mới](https://www.msb.com.vn/ve-chung-toi/tin-tuc-va-su-kien/ve-msb/msb-digital-bank-quan-tri-tai-chinh-ca-nhan-bang-tu-duy-so-the-he-moi/)
- [MSB Digital Bank](https://www.msb.com.vn/khach-hang-ca-nhan/ngan-hang-so/msb-digital-bank/)
- [Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân](https://vanban.chinhphu.vn/?docid=207759&pageid=27160)
