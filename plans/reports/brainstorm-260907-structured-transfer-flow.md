# Brainstorm — Structured (bank-like) transfer flow

Date: 2026-09-07 · Slug: structured-transfer-flow · Status: agreed

## Problem
- Home "Chuyển tiền" (`src/components/home/HomeQuickGrid.tsx:24`) → `/assistant` (empty chat). No real transfer UI/UX.
- AI-drafting path is complete + tested but is the ONLY path, hidden behind free-text chat. Not the flow a bank user expects.
- User ask: "làm thông luồng chức năng chuyển khoản hiện có" = add a proper structured transfer feature; entry at Home is a dead-drop.

## Decisions (user-confirmed)
- Model: **structured form (bank-like)**, AI chat stays as alternate entry.
- Safety: **keep all invariants** (mock, no real execute/confirm/OTP, no fabricated account numbers, recipients only from beneficiary/history/user-typed, draft-only, human confirms).
- Layout: **single scrolling screen** (recipient + amount + memo + source), then hand to existing `/transfer-confirm`.
- Next: create implementation plan via /ck:plan.

## Current-state findings (verified)
- Client providers expose `listBeneficiaries()` / `listAccounts()` / `listTransactions()` via `useProviders()` — enough to build the form with NO AI call.
- `/transfer-confirm` (`src/app/transfer-confirm/TransferConfirm.tsx`) already = review + edit + mock OTP + "Đã ghi nhận" done screen; consumes `StoredTransferDraft` from sessionStorage (`src/lib/transfer-draft-store.ts`).
- `maskAccount()` (in `src/ai/tools/draft-tools.ts`) + `TRANSFER_THRESHOLD_VND` (`src/ai/config.ts`) are pure — reusable client-side.
- `Beneficiary` model carries full `accountNumber`; store/display MASKED only (StoredTransferDraft already masked-only).

## Chosen solution
Add a deterministic form flow that CONVERGES with the AI path at `/transfer-confirm`. No new API, no new LLM path, AI facade untouched (preserves invariants #1/#2/#3).

```
Home "Chuyển tiền" ─► /transfer (NEW single-screen form)
                        recipient → amount + memo + source
                        ▼
Chat AI (unchanged) ─► /transfer-confirm (EXISTING: review·edit·mock OTP·done)
   DraftCard ──────────┘
```

### New files
| File | Responsibility | ~LOC |
|---|---|---|
| `src/app/transfer/page.tsx` | Route wrapper (header + component) | ~25 |
| `src/components/transfer/TransferCompose.tsx` | State; build `StoredTransferDraft` → `putTransferDraft` → push `/transfer-confirm` | ~120 |
| `src/components/transfer/RecipientPicker.tsx` | 3 sources: Đã lưu (beneficiaries) · Gần đây (history payees) · Nhập số TK (+name); search | ~140 |
| `src/components/transfer/AmountMemoFields.tsx` | Amount (+ quick chips), memo, source-account select | ~90 |
| `src/lib/mask-account.ts` | Extract pure `maskAccount()` shared by form + draft-tools | ~10 |

### Reused as-is
`/transfer-confirm` + `TransferConfirm.tsx`, `transfer-draft-store.ts`, `TRANSFER_THRESHOLD_VND`, primitives (`Card`, `SourceBadge`), `useProviders()`, `formatVnd()`.

### Edits
- `HomeQuickGrid.tsx:24` → `href: "/transfer"`.
- `draft-tools.ts` → import `maskAccount` from `@/lib/mask-account` (DRY).
- `TransferConfirm` "done" CTA → accept optional `returnTo` (Home when from form, Trợ lý when from chat).

## Safety invariants preserved
- No fabricated account numbers: recipient only from saved beneficiary / history / user-typed (validate 8–19 digits).
- No real execute/confirm/OTP: still stops at mock `/transfer-confirm`.
- `source: "mock"` throughout; masked account display; provenance kept.
- Threshold/new-payee warning on the screen using shared `TRANSFER_THRESHOLD_VND` (consistent with AI path).
- Form path never invokes AI facade.

## Risks / notes
- Risk-logic duplication (form vs chat) → centralize threshold/new-payee in a shared pure helper to avoid drift (DRY).
- EPIC-13 = AI-drafting; manual structured transfer is a new capability → update `docs/PRODUCT.md` + `plans/project-backlog.md`.
- Empty/loading/error + no-beneficiary states are part of DoD, not extras.

## Success criteria
- Home "Chuyển tiền" → structured `/transfer`; complete a mock transfer end-to-end (form → confirm → done).
- Recipient resolvable from saved/history/typed; no fabricated numbers.
- Threshold warning shows at/above `TRANSFER_THRESHOLD_VND`.
- AI-chat draft path still works and converges at `/transfer-confirm`.
- States covered: empty/loading/error/no-beneficiary. Route smoke test for `/transfer`.

## Next steps
1. /ck:plan → phased plan under ./plans (files, TODO, tests, DoD).
2. Implement single-screen form + shared mask util + risk helper.
3. Update docs (PRODUCT.md, backlog) + smoke test.
