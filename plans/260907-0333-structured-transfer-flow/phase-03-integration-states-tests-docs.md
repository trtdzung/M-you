# Phase 03 — Integration, states, tests, docs

## Context
- Source: `plans/reports/brainstorm-260907-structured-transfer-flow.md`
- Wire the entry point, cover required states, test, and sync docs.

## Overview
- Priority: P1 · Status: pending · Depends on Phase 02.

## Requirements
- Functional: Home entry points to `/transfer`; confirm screen returns to the right
  place per entry; empty/loading/error/no-beneficiary states covered.
- Non-functional: lint + tests green; docs match implementation.

## Related code files
- Modify: `src/components/home/HomeQuickGrid.tsx:24` — `href: "/assistant"` → `href: "/transfer"`.
- Modify: `src/app/transfer-confirm/TransferConfirm.tsx` — read optional `from`/`returnTo`
  query param; "done" CTA routes to Home when `from=transfer`, else keeps "Về trợ lý".
  (Keep DraftCard handoff unchanged; only add the param, default = current behavior.)
- Modify (docs): `docs/PRODUCT.md` — add manual structured transfer as a Level-1/entry
  capability distinct from EPIC-13 AI-drafting; note both converge at the mock confirm.
- Modify (docs): `plans/project-backlog.md` — add a PFM item for structured transfer UI
  (or annotate EPIC-13) with acceptance criteria + DoD.
- Create (test): `src/app/__tests__/` — smoke test that `/transfer` renders without throw
  (mirror `routes.smoke.test.tsx` pattern).
- Read for context: `src/app/__tests__/routes.smoke.test.tsx`, `src/components/states`.

## Implementation steps
1. Update `HomeQuickGrid` href. Verify "Trợ lý AI" footer still links `/assistant`.
2. Add `from`/`returnTo` handling in `TransferConfirm` (default unchanged for chat path).
3. States in `TransferCompose`: `Loading`, `ErrorState`, and a no-beneficiary empty
   state that still allows "Nhập số TK".
4. Tests: `/transfer` smoke render; unit tests for mask + risk (from Phase 01);
   a compose-level test that continuing builds the expected `StoredTransferDraft`
   (mock `putTransferDraft`/router).
5. Docs sync: PRODUCT.md + backlog. Note AI facade untouched; invariants preserved.
6. Run `npm run lint` and `npm run test`; fix failures (do not skip).

## Todo
- [ ] Home "Chuyển tiền" → `/transfer`
- [ ] Confirm `from=transfer` returns to Home; chat path unchanged
- [ ] Empty/loading/error/no-beneficiary states
- [ ] `/transfer` smoke test + helper unit tests + compose handoff test
- [ ] PRODUCT.md + backlog updated
- [ ] lint + test green

## Success criteria
- From Home: full mock transfer end-to-end; "done" returns to Home.
- From chat: DraftCard → confirm → "Về trợ lý" unchanged.
- All states render; smoke + unit tests pass; lint clean.

## Risks / mitigation
- Changing confirm CTA could regress chat path → param defaults to existing behavior;
  add/keep a confirm smoke test.

## Security considerations
- No new data leaves the client; no execution path added; invariants intact.

## Next steps
- `/ck:journal` after implementation; consider adding beneficiary "save new payee"
  later (out of scope now — YAGNI).
