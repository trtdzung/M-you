# PFM Proactive Insights Reframe — Documentation Pack

**Purpose:** Give a coding agent (Gemini 3.8 Flash / Gemini CLI or another repo-aware coding model) enough grounded context to implement the high-level Financial Health Score and low-level Proactive Insights without creating parallel engines, breaking the Home widget, or making unsupported financial claims.

## Read order

1. [`01_REPO_AUDIT.md`](./01_REPO_AUDIT.md) — current code, live request path, duplicated/unused paths, data limitations.
2. [`02_TARGET_CONTRACTS.md`](./02_TARGET_CONTRACTS.md) — target domain boundaries, TypeScript contract shape, score policy.
3. [`03_RULE_REGISTRY.md`](./03_RULE_REGISTRY.md) and [`proactive-rule-registry.json`](./proactive-rule-registry.json) — trigger catalog, availability, required data, suppressions, allowed actions.
4. [`04_IMPLEMENTATION_RUNBOOK.md`](./04_IMPLEMENTATION_RUNBOOK.md) — phases and exact implementation order.
5. [`05_TEST_AND_ACCEPTANCE.md`](./05_TEST_AND_ACCEPTANCE.md) — test requirements and done criteria.
6. [`06_OPEN_DECISIONS.md`](./06_OPEN_DECISIONS.md) — defaults to use and rules that must stay disabled until data exists.
7. [`07_GEMINI_EXECUTION_PROMPT.md`](./07_GEMINI_EXECUTION_PROMPT.md) — copy/paste master prompt for a coding session.

`GEMINI.md` at repository root is the short, persistent instruction file. If a coding environment does not auto-load it, paste its contents or explicitly ask the agent to read it.

## Product framing

- **Bảng 2 / Financial Health:** describe the customer's overall financial position and the data coverage behind that assessment.
- **Bảng 3 / Proactive Insights:** identify a concrete event or risk, explain why it matters, and offer a permitted next action.
- **Dispatcher:** decide which eligible insight to surface, when, and through which existing UI surface; do not let the LLM make this decision.

## Important caveat

Examples in the original brainstorming note are illustrative, not verified live customer values. Never copy sample customer amounts, dates, scoring outputs, rates, or product eligibility into production code or customer-facing copy.
