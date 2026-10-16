---
status: pending
type: product-backlog
product: MSB AI Personal Financial Management
scope: prototype-to-production foundation
---

# MSB AI PFM Project Backlog

## Backlog intent

Build a mock-data-first PFM experience in three progressive levels:

1. Daily money visibility.
2. Assets, liabilities, and goals.
3. Guided decisions, bounded AI recommendations, and assisted transaction drafting (agent prepares, human executes with OTP).

The backlog is ordered by dependency and trust risk. No Level 3 implementation should bypass the Level 1 calculation and data-quality foundation.

## Priority legend

- **P0:** required for the first usable prototype.
- **P1:** required for the complete three-level prototype.
- **P2:** production readiness or future integration.

> Lưu ý: `P0/P1/P2` là **mức ưu tiên của item**. `R0..R4` ở release map dưới đây là **tên release**, không phải mức ưu tiên — một release có thể chứa item nhiều mức ưu tiên khác nhau.

## Release map

| Release | Outcome | Epics |
|---|---|---|
| R0 Foundation | Tech base, PFM shell, mock contracts, consent boundary | 00, 01, 02 |
| R1 Level 1 | User understands transactions and cash flow | 03, 04, 07 |
| R2 Level 2 | User sees wealth and liabilities | 05, 06 |
| R3 Level 3 | User evaluates next actions safely and acts via assisted drafts | 08, 09, 13 |
| R4 Pilot/production | Real read-only integration and controls | 10, 11, 12 |

## EPIC-00 — Technical foundation

### PFM-000 — Tech stack decision and lock

Priority: P0

Chọn và chốt tech stack cho prototype modular monolith trước khi viết feature.

Recommended default (cần xác nhận): TypeScript monorepo, Next.js một deployable, domain/calculation engine là package TS thuần, Vitest cho test tất định, thư viện chart responsive, Anthropic SDK cho AI facade.

Acceptance criteria:

- Stack được ghi lại trong `docs/ARCHITECTURE.md`.
- Một lệnh build và một lệnh test chạy được.
- Ranh giới modular monolith được phản ánh trong cấu trúc thư mục.

### PFM-004 — Project scaffolding and module boundaries

Priority: P0

Dựng khung dự án theo kiến trúc: UI, application API, domain modules, calculation engine, provider interfaces, AI facade.

Acceptance criteria:

- Các module có ranh giới thư mục rõ ràng.
- Calculation engine là package thuần, không phụ thuộc UI hay provider cụ thể.
- UI không import trực tiếp fixture (mọi truy cập qua provider).

### PFM-005 — CI pipeline

Priority: P0

Thiết lập lint, test, và build tự động.

Acceptance criteria:

- Lint và test chạy trên mỗi PR.
- Test tất định thất bại sẽ chặn merge.

### PFM-006 — Design system and component base

Priority: P0

Tạo nền tảng UI mobile-first: design tokens, component cơ bản, layout responsive, và trạng thái empty/loading/error dùng chung.

Acceptance criteria:

- Có bộ component cơ bản tái sử dụng (card, list, chart wrapper, badge nguồn/độ tươi).
- Hỗ trợ nhãn nguồn dữ liệu (`msb` / `self_reported` / `estimated` / `mock`) ở cấp component.

## EPIC-01 — PFM shell, onboarding, and consent

### PFM-001 — PFM entry point

Priority: P0

Create a clear entry point from the MSB Digital Bank home experience.

Acceptance criteria:

- User can enter PFM from the primary navigation.
- First-time user sees value proposition and data scope.
- Returning user lands on Overview.

### PFM-002 — Progressive onboarding

Priority: P0

Collect only the minimum information required for Level 1, then progressively request Level 2 and Level 3 information.

Acceptance criteria:

- Level 1 works with mock MSB accounts and transactions.
- External assets are optional.
- Missing information is shown as incomplete, never silently fabricated.

### PFM-003 — Consent and data-source disclosure

Priority: P0

Show what data is used, why it is used, and whether it is MSB, self-reported, estimated, or mock.

## EPIC-02 — Mock financial data platform

### PFM-010 — Canonical fixture schema

Priority: P0

Create deterministic fixtures for accounts, transactions, assets, liabilities, goals, and mock products.

Acceptance criteria:

- Fixtures cover six months.
- All records have stable IDs.
- Fixtures explicitly carry `source: mock`.
- Bao gồm snapshot lịch sử asset/liability theo tháng để phục vụ net-worth trend (PFM-034).

### PFM-011 — Provider interfaces

Priority: P0

Define provider boundaries for accounts, transactions, assets, liabilities, and market/product data.

Acceptance criteria:

- UI does not import fixture files directly.
- Mock provider can be replaced without changing domain calculations.

### PFM-012 — Seed personas

Priority: P0

Provide at least three personas for testing:

- Stable salary, low debt.
- Irregular income, high discretionary spend.
- High assets, multiple liabilities.

### PFM-013 — Persona switcher (prototype)

Priority: P0

Cho phép chọn/đổi persona đang hoạt động trong bản prototype để demo và test các nhánh dữ liệu khác nhau.

Acceptance criteria:

- Chuyển persona tải lại toàn bộ dữ liệu qua mock provider.
- Là công cụ prototype/demo, không phải tính năng production; tách khỏi luồng người dùng thật.
- Bao phủ tối thiểu 3 persona ở PFM-012.

## EPIC-03 — Transaction management

### PFM-020 — Transaction feed

Priority: P0

Display searchable and filterable transactions with source, status, amount, merchant, and category.

### PFM-021 — Category taxonomy

Priority: P0

Implement a reusable Vietnamese personal-finance category taxonomy.

Acceptance criteria:

- Income, expense, transfer, refund, fee, and card payment are distinct.
- Category is not hard-coded in presentation components.

### PFM-022 — Category correction

Priority: P0

Allow users to edit a transaction category and persist the correction.

### PFM-023 — Merchant normalization

Priority: P1

Group equivalent merchant names into a normalized merchant identity.

### PFM-024 — Recurring transaction detection

Priority: P1

Detect likely recurring income, bills, subscriptions, and debt payments.

### PFM-025 — Budget per category

Priority: P0

Cho phép đặt hạn mức ngân sách theo danh mục và theo dõi mức đã dùng trong kỳ (Level 1 scope).

Acceptance criteria:

- Ngân sách gắn với category taxonomy (PFM-021), không hard-code trong presentation.
- Hiển thị % đã dùng, số ngày còn lại, và trạng thái vượt / sắp vượt hạn mức.
- Chỉ tính chi tiêu đã posted; loại trừ internal transfer; refund hoàn lại đúng danh mục.
- Cung cấp dữ kiện "budget pressure" cho insight detector (PFM-060).

## EPIC-04 — Cash flow and net worth

### PFM-030 — Cash-flow aggregation

Priority: P0

Calculate daily, weekly, and monthly income and expense.

Acceptance criteria:

- Internal transfers are excluded.
- Refunds and reversals reconcile correctly.
- Pending transactions remain separate from posted totals.

### PFM-031 — Cash-flow visualization

Priority: P0

Show income versus expense, fixed versus discretionary spend, and category contribution.

### PFM-032 — Monthly forecast

Priority: P1

Estimate end-of-month cash using posted data and recurring obligations.

### PFM-033 — Basic net worth

Priority: P0

Calculate total assets minus total liabilities and show the period used.

Acceptance criteria:

- Đọc asset/liability từ provider/fixture; không phụ thuộc UI registry của Level 2 (PFM-040/041).
- Phạm vi Level 1 gồm tiền mặt MSB và nợ đã biết; asset ngoài để lại Level 2.
- Giá trị thiếu giữ nguyên là unknown, không mặc định về 0.

### PFM-034 — Net-worth trend

Priority: P1

Display historical net-worth movement with source and freshness metadata.

### PFM-035 — PFM Overview screen

Priority: P0

Dựng màn hình Overview tổng hợp: net worth, tiền khả dụng, thu nhập, chi tiêu, nghĩa vụ sắp tới, và insight nổi bật.

Acceptance criteria:

- Tổng hợp dữ liệu từ cash-flow (PFM-030), net worth (PFM-033), obligations, và insight (PFM-060); không tự tính lại số liệu.
- Mỗi khối số hiển thị kỳ dữ liệu, nguồn, và độ tươi.
- Có trạng thái empty / loading / error và insufficient-data.

## EPIC-05 — Assets and liabilities

### PFM-040 — Asset registry

Priority: P1

Support MSB-held and manually declared assets.

### PFM-041 — Liability registry

Priority: P1

Support credit card, personal loan, mortgage, instalment, and other debt.

### PFM-042 — Valuation freshness

Priority: P1

Display last updated time, source, and estimated/self-reported labels.

### PFM-043 — Debt health

Priority: P1

Calculate outstanding debt, upcoming obligations, debt-to-income ratio, and liquidity pressure.

## EPIC-06 — Goals and financial health

### PFM-050 — Goal creation

Priority: P1

Support emergency fund, travel, home, education, retirement, and custom goals.

### PFM-051 — Goal projection

Priority: P1

Calculate required contribution and projected completion date using explicit assumptions.

### PFM-052 — Financial health indicators

Priority: P1

Show surplus, cash runway, essential-expense coverage, debt-to-income, and emergency-fund progress.

## EPIC-07 — AI insight engine

### PFM-060 — Rule-based insight detectors

Priority: P0

Detect spending spikes, new recurring payments, budget pressure, upcoming obligations, and income changes.

### PFM-061 — Insight evidence

Priority: P0

Every insight must expose its source facts, comparison period, freshness, and confidence.

### PFM-062 — AI narrative layer

Priority: P1

Use AI only to explain structured insight facts in concise Vietnamese.

Acceptance criteria:

- Numeric claims match the financial engine.
- Unsupported claims are rejected.
- User can mark an insight helpful, not helpful, dismiss, or snooze.

### PFM-063 — Monthly financial brief

Priority: P1

Generate a concise monthly summary with positives, risks, and suggested next checks.

## EPIC-08 — AI assistant

### PFM-070 — Suggested prompts

Priority: P1

Provide guided prompts such as “Giải thích tháng này”, “Tôi có thể chi thêm bao nhiêu?”, and “Làm sao đạt mục tiêu nhanh hơn?”.

### PFM-071 — Read-only financial tools

Priority: P1

Expose calculation tools for cash flow, net worth, obligations, goals, and scenarios.

### PFM-072 — Missing-data handling

Priority: P1

Ask for missing inputs or clearly state that a question cannot be answered reliably.

### PFM-073 — Unsafe-advice handling

Priority: P1

Reject guarantees, unsupported predictions, and requests to act without confirmation.

## EPIC-09 — Recommendations and simulation

### PFM-080 — Surplus allocation simulation

Priority: P1

Compare spending, emergency savings, debt repayment, and investment allocation options.

### PFM-081 — Debt repayment scenarios

Priority: P1

Compare repayment priorities using explicit assumptions and show trade-offs.

### PFM-082 — Risk profile

Priority: P1

Collect goal, horizon, liquidity need, and risk tolerance before investment-oriented scenarios.

### PFM-083 — Mock product discovery

Priority: P1

Rank mock savings or investment products by goal and constraints, with transparent reason codes.

Acceptance criteria:

- Product promotion is visually distinct from financial analysis.
- No direct purchase or transfer is executed.
- Downside and assumptions are displayed.

## EPIC-13 — Assisted transaction drafting (Level 3)

> The agent prepares a reviewable transfer draft; the human reviews, confirms, and authenticates (OTP). Depends on EPIC-03 (transactions), EPIC-08 (assistant + tools), and the action boundary PFM-093. No draft flow may bypass PFM-093.

### PFM-129 — Structured transfer entry

Priority: P1

Provide a deterministic Home transfer form alongside AI-assisted drafting. It must accept recipients only from saved beneficiaries, transaction history, or a user-typed 8–19 digit account number; use masked account display/storage; warn at the shared threshold and for new payees; and hand off to the existing mock confirmation screen. The form does not call the AI facade or execute a transfer.

### PFM-130 — Recipient resolution

Priority: P1

Resolve a transfer recipient from saved beneficiaries, explicit user input, or the user's own transaction history via a `findRecipient` tool.

Acceptance criteria:

- Returns only real, existing account references; the agent never fabricates or completes an account number.
- Ambiguous recipients trigger a disambiguation question instead of a guess.
- Each resolved recipient carries `recipientSource` (`saved_beneficiary` / `user_typed` / `transaction_history`) and a masked account for display.

### PFM-131 — Transfer draft preparation (`prepareTransferDraft`)

Priority: P1

Draft-only tool that builds a validated `TransferDraft` (recipient, amount, memo, source account) and a handoff descriptor for the native MSB confirm screen.

Acceptance criteria:

- Produces a `TransferDraft` with `status: draft`; there is no code path to execute, submit, confirm, or authenticate.
- Amount and source account are validated (sufficient-balance check is advisory, never a gate that auto-acts).
- Missing/unclear fields are asked for, not invented.
- Draft is fully editable in the handoff and audited (PFM-091), without storing credentials/OTP.

### PFM-132 — Amount threshold re-confirmation

Priority: P1

Above a configured amount threshold, require an explicit in-chat re-confirmation before the draft is created.

Acceptance criteria:

- Threshold is configurable, not hard-coded in presentation.
- `thresholdHit` / `requiresReconfirm` are set on the draft and surfaced to the user.

### PFM-133 — Fraud / social-engineering checkpoint

Priority: P1

Detect high-risk draft patterns (new/unknown payee + large amount + urgency language) and prompt the user to slow down and re-confirm before drafting.

Acceptance criteria:

- Risk heuristics populate `riskFlags[]` on the draft.
- Urgency-language and new-payee detection covered by safety tests (see PFM-092).
- The checkpoint warns but never blocks a legitimate human decision after re-confirmation.

### PFM-134 — Native MSB handoff (prototype mock)

Priority: P1

Hand the draft to a mock MSB confirmation screen that mirrors the real flow: all fields visible/editable, explicit confirm, and a simulated OTP step performed by the human.

Acceptance criteria:

- The confirm + OTP step is user-driven; nothing is auto-filled or auto-submitted by the agent.
- Cancelling or editing at confirm returns control to the user without side effects.
- On (mock) execution, the resulting transaction carries `source: mock` and is distinct from agent-created draft records.

## EPIC-10 — Trust, security, and audit

### PFM-090 — Source and freshness labels

Priority: P0

Clearly label MSB, self-reported, estimated, and mock values.

### PFM-091 — AI audit event

Priority: P1

Record request ID, consent version, data scope, tools used, validation result, and response metadata.

### PFM-092 — Prompt and output safety tests

Priority: P1

Test prompt injection through merchant names, unsupported financial claims, PII leakage, and action requests. Include transfer-draft attacks: injected instructions to execute/confirm, fabricate a recipient account number, bypass the amount threshold, or suppress the fraud checkpoint.

### PFM-093 — Action confirmation boundary

Priority: P0

The action boundary between the agent (draft) and the human (execution). Applies to every action handoff, including assisted transfer drafting (EPIC-13).

Acceptance criteria:

- The facade has no code path that executes, confirms, submits, or authenticates a transaction; those live only in the native MSB flow.
- The agent never handles or requests OTP/credentials.
- Every action handoff prefills a reviewable draft with all fields editable and requires explicit user confirmation + authentication.
- Attempts to bypass confirmation (via prompt injection or crafted input) are rejected and audited.

### PFM-094 — Consent revocation and data deletion/export

Priority: P1

Cho phép người dùng thu hồi consent, xóa, và xuất dữ liệu PFM của mình.

Acceptance criteria:

- Thu hồi consent ghi `revokedAt` và chặn truy cập dữ liệu theo scope đã thu hồi.
- Có đường xóa và xuất dữ liệu người dùng (tuân thủ Nghị định 13/2023/NĐ-CP).
- Hành động được ghi vào consent/AI audit (PFM-091).

## EPIC-11 — Integration readiness

### PFM-100 — Read-only adapter contract

Priority: P2

Document mapping from future MSB account, card, savings, and investment systems to canonical PFM models.

### PFM-101 — Sync and reconciliation status

Priority: P2

Expose sync status, last successful sync, partial coverage, and reconciliation errors.

### PFM-102 — Observability and metrics

Priority: P2

Thu thập chỉ số vận hành: sync freshness, categorization confidence và correction rate, calc errors, AI tool-call latency/errors, grounding validation failures, và feedback.

Acceptance criteria:

- Các chỉ số ở `docs/ARCHITECTURE.md` §Observability có nguồn phát sự kiện.
- Grounding validation failures và calc errors được đếm và cảnh báo.

## EPIC-12 — Quality and release

### PFM-110 — Calculation test suite

Priority: P0

Cover transfers, refunds, reversals, pending transactions, liabilities, and net-worth reconciliation.

### PFM-111 — AI grounding test suite

Priority: P1

Verify every generated number and period against structured test fixtures.

### PFM-112 — Accessibility and responsive QA

Priority: P1

Test charts, labels, empty states, contrast, touch targets, and keyboard navigation.

### PFM-113 — End-to-end prototype journey

Priority: P0

Test onboarding → overview → correction → goal → simulation.

### PFM-114 — Provider adapter contract tests

Priority: P1

Kiểm thử hợp đồng cho các provider interface để mock provider có thể thay bằng adapter thật mà không đổi domain calculations.

Acceptance criteria:

- Mỗi provider (account, transaction, asset, liability, market) có bộ contract test dùng chung.
- Test xác minh hình dạng dữ liệu canonical và bảo toàn metadata source/freshness.

## Definition of done

A backlog item is done when:

- Acceptance criteria pass.
- Empty, loading, error, and insufficient-data states exist.
- Financial calculations have deterministic tests where applicable.
- Source and freshness metadata are preserved.
- Analytics event is defined for meaningful user actions.
- Accessibility and responsive behaviour are checked.
- No feature bypasses consent or the AI action boundary.

## Release gates

### Level 1 gate

- Transaction, cash flow, and net worth reconcile against fixtures.
- Internal transfers do not distort metrics.
- User can correct categorization.
- AI insight numbers are grounded.

### Level 2 gate

- Manual assets and liabilities are clearly labelled.
- Goals calculate from explicit assumptions.
- Debt and liquidity indicators explain their inputs.

### Level 3 gate

- Risk and goal context are collected.
- Recommendations show assumptions, trade-offs, downside, and reason codes.
- No autonomous action is possible: the agent can only produce a reviewable draft.
- Transfer drafts never contain a fabricated recipient account number.
- Execution, confirmation, and OTP are performed only by the human in the native MSB flow.
- Amount-threshold re-confirmation and the fraud checkpoint fire as specified and are covered by safety tests.

### Pilot gate

- Read-only integration is reconciled.
- Consent, audit, security, privacy, and model-risk reviews are complete.
