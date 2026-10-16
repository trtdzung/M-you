# Phase 01 — Shared utils + data plumbing

## Context
- Source: `plans/reports/brainstorm-260907-structured-transfer-flow.md`
- Prevent risk-logic drift between form and AI chat (DRY). Extract shared pure code.

## Overview
- Priority: P1 · Status: pending
- Build the pure, testable foundation the form screen consumes: a shared account
  mask util, a shared transfer-risk helper, and client-side recipient sources.

## Key insights
- `maskAccount()` currently lives in `src/ai/tools/draft-tools.ts` (pure). Extract
  to a neutral util so the client form does not import an AI/server module.
- `Beneficiary` model carries full `accountNumber`; the form MUST display/store
  masked only (`StoredTransferDraft.accountMasked`).
- History payees = `raw.transactions` where `type === "transfer"` and
  `counterpartyAccountNumber` is a string (mirror `draft-tools.historyPayees`).
- `TRANSFER_THRESHOLD_VND` (`src/ai/config.ts`) is a pure constant — reuse it.

## Requirements
- Functional: expose masked recipient candidates from 3 sources (saved / recent /
  typed) and a deterministic risk assessment (over_threshold, new_payee).
- Non-functional: pure functions, unit-testable, no server-only import in client path.

## Related code files
- Create: `src/lib/mask-account.ts` — `maskAccount(accountNumber): string` (moved).
- Create: `src/lib/transfer-risk.ts` — `assessTransferRisk({ amount, isNewPayee }): TransferRiskFlag[]` + `hitsThreshold(amount): boolean`, using `TRANSFER_THRESHOLD_VND`.
- Modify: `src/ai/tools/draft-tools.ts` — import `maskAccount` from `@/lib/mask-account` (remove local copy); keep behavior identical.
- Read for context: `src/domain/models/index.ts` (Beneficiary, Account, Transaction, TransferRiskFlag), `src/ai/config.ts`, `src/providers/interfaces.ts`.

## Implementation steps
1. Create `src/lib/mask-account.ts` with the exact `maskAccount` body from draft-tools.
2. Update `draft-tools.ts` to import it; delete the local function. Run tests to
   confirm `draft-tools.test.ts` / `draft-attack.test.ts` still pass.
3. Create `src/lib/transfer-risk.ts`:
   - `hitsThreshold(amount) = amount >= TRANSFER_THRESHOLD_VND`
   - `assessTransferRisk({ amount, isNewPayee })` → push `over_threshold` / `new_payee`.
   - (Urgency is NL-only; not applicable to the form.)
4. (Optional, if clean) have `action-pipeline.ts` reuse `hitsThreshold`/`assessTransferRisk`
   to keep a single source — only if it does not change existing test expectations.

## Todo
- [ ] `src/lib/mask-account.ts` created; draft-tools imports it
- [ ] `src/lib/transfer-risk.ts` created (threshold + flags)
- [ ] Existing AI tests still green
- [ ] Unit tests for mask + risk helpers

## Success criteria
- `maskAccount("...1991") === "****1991"`; draft-tools tests unchanged/green.
- `hitsThreshold(TRANSFER_THRESHOLD_VND) === true`; risk flags correct for new payee.

## Risks / mitigation
- Moving `maskAccount` breaks an import → grep usages, update all; run full test.

## Security considerations
- Store/display masked only; never persist full account number client-side.

## Next steps
- Phase 02 consumes these utils to build the compose screen.
