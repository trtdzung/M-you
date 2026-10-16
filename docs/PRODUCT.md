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

Hũ is **the single budgeting concept in the product** — there is no separate "Ngân sách" feature surfaced beside it (the earlier per-category Budget still exists in code but is dormant, not shown to the user). A jar earmarks a **share of the current primary-account balance** — a display-only snapshot partition, not a monthly spending envelope. Fully deterministic, no AI in the calculation path.

- **Snapshot partition, not an envelope.** Each jar carries a `percent` (share of the primary account's current balance) or a fixed `amount` (VND). There is no income basis, no monthly anchor, no clock, no sub-account, and no jar balance — a jar never holds or moves money; it only labels a slice of the one real balance.
- **Exact by construction.** `Σ(every jar earmark) + "Chưa phân bổ" ≡ số dư tài khoản chính`, always. "Chưa phân bổ" is the residual (`số dư − Σ earmarks`) and absorbs the whole-VND rounding remainder, so the identity holds exactly rather than approximately.
- **Primary account.** The partition is drawn against the single `type: "current"` account. With zero or two-or-more current accounts, the balance to partition is genuinely **unknown** — the UI shows an explicit unknown state, never a fabricated split and never a silent 0.
- **Two numbers per jar.** Each jar shows **chia** (its earmark, fixed) and **đã tiêu kỳ này** (an informational overlay: net expense over the jar's categories for the selected month, plus a month-over-month delta). The overlay follows the same spend rules as cash flow (internal transfers excluded, refunds reversed, reversed dropped, pending kept separate) and never changes the earmark or the Σ≡balance identity.
- **Chia doubles as the monthly budget line.** `đã tiêu > chia` is a non-blocking "Vượt ngân sách" warning — this is the product's only budgeting signal. Over-allocation (`Σ chia > số dư`, i.e. a negative residual) is also a non-blocking warning, never a hard error.
- **Level 1:** jars render as a "Hũ chi tiêu" section on the Cashflow tab, plus a jar-budget insight that flags an over-allocated residual or the most-breached jar; it only fires against the current month. Setup — pick one of three templates (Cá nhân: 6 hũ, default; Gia đình: 4 hũ; Kinh doanh: 3 hũ, each summing to ≤100% so applying one never starts over-allocated), then create/edit/delete jars, assign categories, and edit earmarks with a live balance-reconciliation meter — lives on its own route, `/pfm/jars`, reachable from the Cashflow tab and kept off the main PFM tab bar so it stays at four tabs. Applying a template replaces the current jar set (with a confirm step).
- **Trust line:** "Hũ chỉ để bạn nhìn tiền rõ hơn — tiền vẫn nằm nguyên trong tài khoản của bạn."
- **Level 3:** the deterministic "phân bổ thặng dư" (surplus allocation) what-if sources its number from the **"Chưa phân bổ" residual** (a stock, floored at 0), not `income − expense`. It is a **read-only simulation** — no money movement, no transfer draft, no goal mutation. An unknown primary balance yields **"unknown" surplus, never 0₫**.

This is Model A (snapshot partition), which **supersedes** the earlier monthly spending-envelope design (allocation as % of income, "used" = period spend vs allocation, income-basis resolution) explored in `plans/260908-1311-spending-jars` — that design was not shipped.

### Basic net worth

```text
Net worth = total assets - total liabilities
```

Level 1 includes MSB-held cash and known liabilities. External assets are deferred to Level 2 and must be labelled as self-reported when introduced.

### AI insights

Examples:

- “Chi tiêu ăn uống tăng 24% so với tháng trước.”
- “Hũ Giải trí đã tiêu vượt phần chia tháng này.”
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

### Liabilities

- Credit card balance.
- Personal loan.
- Mortgage.
- Instalment plan.
- Other manually declared debt.

Show principal, interest rate when known, minimum payment, due date, and remaining term. Missing fields are shown as unknown rather than guessed.

### Goals

Initial goal templates:

- Emergency fund.
- Travel.
- Home purchase.
- Education.
- Retirement.
- Custom goal.

Each goal has target amount, target date, current amount, monthly contribution, priority, and funding source.

### Financial health indicators

Use several explainable indicators instead of one authoritative score:

- Monthly surplus.
- Essential-expense coverage.
- Cash runway.
- Debt-to-income ratio.
- Emergency-fund progress.
- Concentration of assets and liabilities.

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

The prototype ships a **3-tab MSB banking layout**, matching the real MSB app rather than a generic 5-tab PFM layout. The IA refactor is complete:

| Tab | Route(s) | Purpose |
|---|---|---|
| **Trang chủ** (Home) | `/` | MSB-style home: hero header, primary account card, quick actions, promos/insights. Not a PFM dashboard. |
| **Tài khoản** (Accounts) | `/accounts`, `/accounts/[id]`, `/transactions` | Account list → account detail (with per-account transactions) → all-transactions view. |
| **PFM** | `/pfm` (single route, client-side tabs via `?tab=`) | One screen with 4 tabs — **Tổng quan** (Overview cockpit), **Dòng tiền** (Cashflow), **Tài sản** (Wealth), **Gợi ý** (Insights) — switched client-side with no navigation or refetch. |

A floating **Assistant FAB** (sparkle icon) sits above the tab bar on every screen and links to `/assistant`; it hides itself on the assistant screen. **Settings** (`/settings`) is not a tab — it holds consent scope + revoke, the demo persona switcher, and About, and is reachable in at most two taps (tap the account tier row on the account card, or navigate directly to `/settings`).

Legacy routes `/cashflow`, `/wealth`, `/pfm/cashflow`, `/pfm/wealth`, and `/pfm/insights` still exist as thin redirects to the matching `/pfm?tab=X` deep link, so old links and bookmarks keep working.

### Masked account number (implemented)

The primary account card on Home shows a display-safe, masked account number (e.g. `•••• 1991` — last 4 digits only, non-digits stripped) rather than the full number, with the balance hidden by default behind an eye toggle. This is a presentation-only decision: the full account number is never carried on the UI-facing account model, and masking has no effect on provenance or the calculation engine.

## Primary screens

1. **Home (Trang chủ):** hero header, primary account card (masked number, hide/show balance, tier as marketing metadata only), quick-action grid, promo carousel with a top insight surfaced inline. Obligations are not shown here — they live on the PFM Overview cockpit.
2. **Tài khoản (Accounts):** account list → account detail with a scoped transaction list; a shared "all transactions" entry point.
3. **PFM (`/pfm`):** single route, 4 client-side tabs.
   - **Tổng quan (Overview):** a no-scroll "4-Question Cockpit" — hero net worth (with delta badge and sparkle trend), a 2×2 KPI grid (Dòng tiền tháng, Cuối tháng estimate, Sắp phải trả, Sức khỏe/runway), the single top-severity insight, and a worst-case provenance footer (lowest-trust source + oldest freshness across every tile). Always the current month — there is no PeriodPicker on this tab, by design (the end-of-month projection is only valid when "now" is inside the displayed month).
   - **Dòng tiền (Cashflow):** trend-primary view with a multi-month income/expense/net chart (gaps for months with no data, never a misleading 0đ bar), fixed-vs-discretionary breakdown, and category trend; keeps the shared PeriodPicker.
   - **Tài sản (Wealth):** assets, liabilities, allocation, balance-sheet trend, and a 2×2 financial-health panel (runway, surplus, essential-expense coverage, asset concentration); keeps the shared PeriodPicker.
   - **Gợi ý (Insights):** insight list with severity filters (info / attention / urgent).
4. **Goals:** progress, required monthly contribution, and scenarios.
5. **Settings:** consent scope view + revoke, demo persona switcher, About — reachable from the account card, not a tab.
6. **AI Assistant:** free-text streaming chat grounded on live financial data — explain-this-month, spending/obligations/net-worth questions, goal and debt what-if simulations, source-chip provenance per answer. Assisted transfer drafting (draft → review → hand off to MSB confirm + OTP) is implemented, feature-gated by `ENABLE_TRANSFER_DRAFTING`; transfer requests fall back to a plain refusal when the flag is off.

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
