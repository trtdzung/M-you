# Phase 02 — /transfer compose screen (single scroll)

## Context
- Source: `plans/reports/brainstorm-260907-structured-transfer-flow.md`
- Layout decision: single scrolling screen (user-confirmed).

## Overview
- Priority: P1 · Status: pending · Depends on Phase 01.
- Build the `/transfer` route and its components. On "Tiếp tục", assemble a
  `StoredTransferDraft` and push to the EXISTING `/transfer-confirm`.

## Key insights
- Reuse `putTransferDraft` (`src/lib/transfer-draft-store.ts`) and let the existing
  `TransferConfirm` handle review/edit/mock-OTP/done — do NOT duplicate a review step.
- Data via `useProviders()`: `listBeneficiaries()`, `listAccounts()`, `listTransactions()`.
- `StoredTransferDraft` shape: `{ id, name, accountMasked, amount, memo, sourceLabel }`.
- Source-account label mirror: `${institution} · thanh toán|tiết kiệm` (see `sourceLabel` in action-pipeline).

## Requirements
- Functional: pick recipient (3 sources), enter amount (+ quick chips), memo (optional),
  choose source account (default `type === "current"`), see risk warning, continue.
- Non-functional: each file < 200 LOC; mobile-first; a11y (labels, focus rings);
  Vietnamese copy; no fabricated account numbers.

## Architecture / data flow
```
useProviders() ─► TransferCompose (state)
   ├─ RecipientPicker  → {name, accountMasked, source}
   ├─ AmountMemoFields → {amount, memo, sourceAccountId}
   └─ transfer-risk    → risk flags (warning banner)
"Tiếp tục" → putTransferDraft(StoredTransferDraft) → router.push('/transfer-confirm?draftId=..&from=transfer')
```

## Related code files
- Create: `src/app/transfer/page.tsx` — route wrapper (ScreenHeader + `<TransferCompose/>`).
- Create: `src/components/transfer/TransferCompose.tsx` — orchestrates state + build draft + navigate; loading/error/empty states.
- Create: `src/components/transfer/RecipientPicker.tsx` — segmented tabs: **Đã lưu** (beneficiaries) · **Gần đây** (deduped history payees) · **Nhập số TK** (account number 8–19 digits + name); search box; selection highlights; masks via `maskAccount`.
- Create: `src/components/transfer/AmountMemoFields.tsx` — amount input (numeric, `formatVnd` preview), quick chips (500k/1tr/5tr), memo, source-account `<select>`.
- Read for context: `src/app/transfer-confirm/TransferConfirm.tsx`, `src/components/assistant/DraftCard.tsx` (reference for handoff + safety copy), `src/components/shell/ScreenHeader.tsx`, `src/components/primitives`.

## Implementation steps
1. Scaffold `RecipientPicker`: load beneficiaries + history payees; dedupe history by
   account; typed-account validation (`/^\d{8,19}$/` after stripping spaces/dots);
   emit selection `{ name, accountMasked, source: 'saved_beneficiary'|'transaction_history'|'user_typed', isNewPayee }`.
2. Scaffold `AmountMemoFields`: parse amount to number; quick chips; memo; source-account
   select defaulting to current account; expose `sourceLabel`.
3. `TransferCompose`: compose the two, compute risk via `assessTransferRisk`, render a
   warning banner when flags present; disable "Tiếp tục" until recipient + valid amount.
4. On continue: build `StoredTransferDraft` (id = `form_${Date.now()}` or crypto id),
   `putTransferDraft`, then `router.push`.
5. `src/app/transfer/page.tsx`: header "Chuyển tiền" + safety note (mock, self-confirm).

## Todo
- [ ] `RecipientPicker` (3 sources, search, validation, masked display)
- [ ] `AmountMemoFields` (amount + chips + memo + source select)
- [ ] `TransferCompose` (state, risk banner, gating, handoff)
- [ ] `src/app/transfer/page.tsx` route
- [ ] Continue → correct `StoredTransferDraft` reaches `/transfer-confirm`

## Success criteria
- Select a saved beneficiary, enter 5.000.000, continue → confirm screen prefilled
  with masked account + source label; complete mock done.
- Typed account rejects non-8–19-digit input; never auto-generates a number.
- Amount ≥ threshold shows the "Vượt ngưỡng" warning.

## Risks / mitigation
- Empty beneficiary list → show "Nhập số TK" tab as fallback (Phase 03 states).
- File size creep → keep pickers presentational; state stays in `TransferCompose`.

## Security considerations
- Only masked account travels to the store/URL (URL carries only `draftId`).
- Recipient sources restricted to real records / validated user input.

## Next steps
- Phase 03: confirm `returnTo`, states polish, tests, docs.
