---
type: journal
date: 2026-09-03
topic: AI facade implementation (Phases 01-05 of the AI-native facade migration)
---

# AI Facade Implemented — Phases 01-05

## Context

The AI assistant was previously a stub: `src/insights/assistant.ts`, a `switch-case`
over 3 fixed prompts with templated answers, with no model SDK in `package.json`.
Phases 01-05 of the AI-native facade migration (see
`plans/reports/brainstorm-260903-ai-native-repositioning.md`) replaced this with a
real, grounded assistant. This is no longer a stub.

## What changed

- **Provider-agnostic LLM layer.** Neutral `LlmClient` contract
  (`src/ai/llm/types.ts`), Anthropic default adapter
  (`src/ai/llm/anthropic-client.ts`, model `claude-sonnet-5`), env-selected
  provider (`LLM_PROVIDER` in `.env.example`), `server-only` key isolation, and
  an offline fallback (`src/ai/pipeline/fallback.ts`) that reuses the old
  templated answers when no key/provider is configured.
- **Calculation reuse.** `computeFinancials` extracted to
  `src/domain/engine/finance-compose.ts` so the server pipeline uses the exact
  same deterministic engine as the UI. New simulation engines:
  `src/domain/engine/goals.ts` (`simulateGoal`) and `debt.ts`
  (`simulateDebtRepayment`).
- **Tool layer — Tier A only.** Six whitelisted tools in `src/ai/tools/`
  (`getMonthlyCashflow`, `getSpendingByCategory`, `getUpcomingObligations`,
  `calculateNetWorth`, `simulateGoal`, `simulateDebtRepayment`). Tier B
  (`prepareTransferDraft`, `findRecipient`) is deliberately absent — deferred to
  Level 3 / `EPIC-13`.
- **Pipeline.** `src/ai/pipeline/orchestrator.ts` runs intent classify → scope
  check → required-data check → LLM tool-use loop → numeric grounding +
  safety validation → streamed answer. Transfer intents are refused outright
  (no draft, no Tier B tool call). `validator.ts` rejects any narrative
  containing an amount that doesn't trace back to a tool result, and blocks
  guaranteed-return language or false completed-transaction claims.
- **Streaming chat UI.** NDJSON route (`src/app/api/assistant/route.ts`, Node
  runtime), client reader (`src/lib/assistant-stream.ts`), chat components
  (`src/components/assistant/*`) including what-if mini charts.
- **Proactive + audit.** Proactive openers from the top rule-based insight
  (`src/ai/proactive/openers.ts`), PII-free AI audit ring buffer
  (`src/ai/audit/*`).

## Verification

94 tests pass, `npm run build` is clean, ESLint is clean, no API key leak in
the client bundle (`server-only` guard on `src/ai/llm/`).

## Docs updated

- `docs/ARCHITECTURE.md` — "AI facade" section rewritten to describe the real
  pipeline, LLM layer, and two-tier tool model (Tier A implemented, Tier B
  planned).
- `docs/PRODUCT.md` — AI product contract and Level 3 assisted-transfer-drafting
  sections updated from aspirational framing to "implemented" (Tier A) vs.
  "planned, not yet built" (Tier B).

## Next

Tier B (assisted transfer drafting: `findRecipient`, `prepareTransferDraft`,
fraud checkpoint, amount-threshold re-confirmation) per `EPIC-13`.
