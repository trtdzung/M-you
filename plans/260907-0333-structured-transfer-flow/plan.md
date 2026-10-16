---
title: "Structured (bank-like) transfer flow"
description: "Single-screen /transfer form converging with existing /transfer-confirm; deterministic, no AI facade changes."
status: pending
progress: 0/3 phases complete
priority: P1
effort: ~8h
created: 2026-09-07
source: plans/reports/brainstorm-260907-structured-transfer-flow.md
tags: [frontend, transfer, level3, deterministic]
blockedBy: []
blocks: []
---

# Structured (bank-like) transfer flow

Add a deterministic, form-driven transfer entry that CONVERGES with the existing
AI-drafting path at `/transfer-confirm`. No new API, no new LLM path, AI facade
untouched. Source of truth: `plans/reports/brainstorm-260907-structured-transfer-flow.md`.

## Goal
Home "Chuyển tiền" → structured `/transfer` (single scrolling screen: recipient +
amount + memo + source) → existing `/transfer-confirm` (review · edit · mock OTP ·
done). AI chat draft path keeps working and converges at the same confirm screen.

## Safety invariants (hard constraints — CLAUDE.md #2/#3/#4/#5)
- Recipient ONLY from saved beneficiary / transaction history / user-typed number
  (validate 8–19 digits). NEVER fabricate an account number.
- No real execute/confirm/OTP — stop at the existing mock `/transfer-confirm`.
- `source: "mock"` throughout; display account MASKED only; keep provenance.
- Threshold/new-payee warning via shared `TRANSFER_THRESHOLD_VND`.
- Form path never invokes the AI facade.

## Phases
| # | Phase | Status | File |
|---|-------|--------|------|
| 01 | Shared utils + data plumbing | pending | phase-01-shared-utils-and-data.md |
| 02 | /transfer compose screen (single scroll) | pending | phase-02-transfer-compose-screen.md |
| 03 | Integration, states, tests, docs | pending | phase-03-integration-states-tests-docs.md |

## Key dependencies
- Reuse: `/transfer-confirm`, `transfer-draft-store.ts`, `useProviders()`,
  `formatVnd()`, primitives (`Card`, `SourceBadge`), `TRANSFER_THRESHOLD_VND`.
- Phase 02 depends on Phase 01 (shared util + risk helper + recipient sources).
- Phase 03 depends on Phase 02.

## Definition of done
- Complete a mock transfer end-to-end from Home (form → confirm → done).
- Recipient resolvable from saved/history/typed; no fabricated numbers.
- Threshold warning at/above `TRANSFER_THRESHOLD_VND`.
- AI-chat draft path still converges at `/transfer-confirm`.
- States: empty/loading/error/no-beneficiary. `/transfer` route smoke test passes.
- `npm run lint` + `npm run test` green. Docs (PRODUCT.md, backlog) updated.
