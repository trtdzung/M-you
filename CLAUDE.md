# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

The prototype is **scaffolded and partially implemented**. Stack (locked): **Next.js 15 (App Router) + React 19 + TypeScript 5**, **Tailwind CSS v4**, **Recharts** for charts, **lucide-react** for icons, **Vitest + Testing Library** for tests. Scripts: `npm run dev` / `build` / `start` / `lint` / `test` (`vitest run`).

Implemented so far: mobile-first UI shell and screens (`src/app/*`, `src/components/*`), the deterministic calculation engine with tests (`src/domain/engine/*`), rule-based insight detectors (`src/insights/*`), the mock provider + fixtures behind provider interfaces (`src/providers/*`), and consent/state plumbing (`src/state/*`, `src/lib/*`).

**Known gap:** the AI assistant is still a stub — `src/insights/assistant.ts` is a `switch-case` over 3 fixed prompts with templated answers. There is **no LLM wired yet** (no model SDK in `package.json`). Building the real AI facade (grounded tool-calling, streaming chat, what-if, assisted transfer drafting) is the current priority; see `plans/reports/brainstorm-260903-ai-native-repositioning.md`.

The source of truth is three documents. Read them before proposing or writing any implementation:

- `docs/PRODUCT.md` — what the product is: personas, the three progressive PFM levels, screens, scope boundaries, mock-data strategy, and the AI product contract (what the assistant may and may not do).
- `docs/ARCHITECTURE.md` — how it is built: module responsibilities, the canonical data model, provider abstraction, the AI facade pipeline, calculation rules, and the prototype→pilot→production evolution path.
- `plans/project-backlog.md` — the ordered, dependency-aware backlog (epics `EPIC-00`..`EPIC-13`, items `PFM-0xx`) with P0/P1/P2 priorities, acceptance criteria, definition of done, and per-level release gates. `EPIC-13` covers Level 3 assisted transfer drafting (agent prepares, human executes).

## What this product is

"MSB Financial Copilot" — a mock-data-first personal financial management (PFM) app for a Vietnamese bank (MSB). It ships in three progressive levels gated by data coverage and user trust: **Level 1** money visibility (transactions, cash flow, basic net worth), **Level 2** wealth picture (assets, liabilities, goals, health indicators), **Level 3** guided decisions and assisted actions (bounded simulations, recommendations, and agent-prepared transaction drafts that the human reviews, confirms, and authenticates). User-facing copy and categories are Vietnamese.

The intended shape is a **modular monolith**: mobile-first UI → application/BFF API → domain modules → a deterministic calculation engine → provider interfaces → an AI facade. Microservices and autonomous agents are deliberately deferred.

## Architectural invariants (do not violate)

These constraints are the reason the architecture exists. Any implementation, in any language, must preserve them:

1. **Deterministic engine is the source of financial truth.** All financial numbers come from a pure, independently testable calculation engine — never from the LLM. The LLM explains and simulates; it never becomes the ledger or overrides a calculation.
2. **AI is a non-committing, constrained facade with two tool tiers.** (a) **Read tools** — whitelisted, read-only analytics (e.g. `getMonthlyCashflow`, `calculateNetWorth`, `simulateGoal`). (b) **Draft tools** — prepare a reviewable action draft (e.g. `prepareTransferDraft`) but NEVER commit it. In both tiers the LLM cannot mutate the ledger, execute, confirm, submit, or authenticate a transaction. Every AI request runs the pipeline: intent → consent/scope check → required-data check → deterministic tool call → LLM narrative → numeric/schema/safety validation → answer (or draft handoff) with sources and assumptions.
3. **No autonomous money movement.** The AI may *prepare* a transfer draft (recipient, amount, memo, source account), but every actual money movement requires the human to (a) review every field, (b) confirm in the native MSB flow, and (c) authenticate (OTP/password). The AI never handles OTP, credentials, or the execute/confirm action, and never invents a recipient account number — recipients come only from saved beneficiaries, explicit user input, or the user's own transaction history (real account numbers, never fabricated). Drafts above a configured amount threshold require an in-chat re-confirmation before the draft is created. Never generate code that moves money automatically or that submits/confirms a transfer on the user's behalf.
4. **UI depends on provider interfaces, not fixtures.** UI/domain code must not import mock fixture files directly. Data flows through `AccountDataProvider`, `TransactionDataProvider`, `AssetDataProvider`, `LiabilityDataProvider`, `MarketDataProvider`. The mock provider must be swappable for real MSB adapters without changing calculation or presentation contracts. All mock records carry `source: mock`.
5. **Every number carries provenance.** Aggregates and displayed values expose period, source, and freshness. Distinguish `msb` / `self_reported` / `estimated` / `mock`; never present a manually entered value as bank-verified.
6. **Missing values stay unknown.** Do not silently default missing data to zero. Internal transfers are excluded from income/expense; refunds reverse the right category; reversed transactions are excluded; pending is kept separate from posted totals.
7. **Categories are not hard-coded in presentation.** The Vietnamese category taxonomy is data, reused across modules.

## Working conventions

- Follow the backlog dependency order: no Level 3 work bypasses the Level 1 calculation and data-quality foundation. Check the relevant `PFM-0xx` acceptance criteria and the "Definition of done" / "Release gates" sections in `plans/project-backlog.md` before marking work complete.
- When implementing a financial rule, add a deterministic test against fixtures in the same change — calculation correctness is a hard gate (target: 100% against fixtures), and AI numeric claims must trace to structured facts.
- Cover empty, loading, error, and insufficient-data states for every feature — these are part of the definition of done, not extras.
- Project docs live at the `docs/` root as `PRODUCT.md` / `ARCHITECTURE.md` (not the roadmap/changelog layout referenced in global rules). Session journals go in `docs/journals/`.
