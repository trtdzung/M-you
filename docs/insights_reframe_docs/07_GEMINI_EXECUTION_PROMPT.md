# 07 — Master prompt for Gemini 3.8 Flash

Use this prompt in the repo-aware coding agent after opening the repository root. Gemini CLI users should let the tool load the root `GEMINI.md`; if it does not, ask it to read `GEMINI.md` explicitly.

---

You are the senior TypeScript engineer implementing the PFM Financial Health Index and Proactive Insights reframe in this repository. Work directly in the repository; do not return only a design proposal.

## Mandatory context

Read these files first:

- `GEMINI.md`
- `docs/insights_reframe_docs/README.md`
- `docs/insights_reframe_docs/01_REPO_AUDIT.md`
- `docs/insights_reframe_docs/02_TARGET_CONTRACTS.md`
- `docs/insights_reframe_docs/03_RULE_REGISTRY.md`
- `docs/insights_reframe_docs/04_IMPLEMENTATION_RUNBOOK.md`
- `docs/insights_reframe_docs/05_TEST_AND_ACCEPTANCE.md`
- `docs/insights_reframe_docs/06_OPEN_DECISIONS.md`
- `docs/insights/proactive_insight_llm_contract.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA-READINESS.md`

Then inspect the actual implementation and run `rg` searches described in `01_REPO_AUDIT.md`. Do not trust a doc without checking whether the relevant code is still current.

## Goal

Implement the safe, testable vertical slice of the new design while progressively completing the runbook phases. Deliver a working prototype, not just interfaces or placeholder files:

1. Characterize and test the active Home insight path.
2. Implement the pure Financial Health Score policy from `02_TARGET_CONTRACTS.md`, with honest null/data-coverage semantics.
3. Complete the jar-pressure insight vertical slice through the current Home API/widget without breaking its request/response contract.
4. Add or update the registry and test coverage for any rule you ship.
5. Implement additional insight families only where the source data requirements in `03_RULE_REGISTRY.md` are met.
6. Use a single dispatcher/persistence path; do not introduce a third pipeline. If the existing two paths cannot be unified safely within this change, preserve the currently wired Home route and document the remaining migration rather than silently switching services.
7. Update architecture/readiness docs to match shipped code.

## Engineering approach

- Work through `04_IMPLEMENTATION_RUNBOOK.md` in order; do not skip Phase 0.
- After each phase, run targeted tests. Make small coherent changes rather than one giant rewrite.
- Keep all financial math, score mapping, eligibility, candidate selection, priority and action validation in deterministic TypeScript.
- Preserve null/unknown; never use zero to mean missing.
- Preserve data source, freshness and observation period.
- Reuse current engine results and selectors. Do not recalculate jar amount, CASA unallocated pool, cashflow, net worth, or recurring values independently in the detector.
- Do not hardcode example customer amounts/dates/product rates from the brainstorm.
- Do not enable rules that need deposit maturity dates, card statement history, 90-day balances, credit history or insurance data absent from the model.
- Keep action chips within the actions implemented by the active UI. No automatic financial transaction or product purchase.
- Do not add a Gemini API dependency or runtime LLM integration: Gemini is the coding agent for this task, not necessarily the runtime narrator.
- Do not run `npm run db:seed` to initialize or migrate the DB.

## Required verification

Run targeted Vitest files for each changed module, followed by `npm test`, `npm run build`, and `npm run lint` where environment permits. Inspect the git diff for unrelated changes. If commands fail because packages are not installed or because an existing script is incompatible, report the exact reason and do not claim success. Update `docs/insights_reframe_docs/implementation-notes.md` with the actual phase completion, tests and blockers.

## Final response format

Provide:
- Implementation summary and behavior changes.
- Files added/modified.
- Score policy and shipped/blocked rule families.
- Exact test/build/lint commands and outcomes.
- DB migrations/env changes, if any.
- Unresolved data and product decisions.
- Next concrete implementation step.

Do not stop after writing an action plan unless an actual blocker prevents safe code changes.

---
