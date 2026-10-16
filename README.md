# MSB Financial Copilot

A mock-data-first **personal financial management (PFM)** prototype for a Vietnamese bank (MSB), built around a **grounded, non-committing AI assistant**. All financial numbers come from a deterministic calculation engine; the AI explains, simulates, and *drafts* actions — it never becomes the ledger and never moves money on its own.

> Prototype status: the UI shell, deterministic engine, rule-based insights, mock providers, and the AI facade pipeline are implemented. User-facing copy and categories are Vietnamese.

## Product at a glance

The product ships in three progressive levels, gated by data coverage and user trust:

| Level | Name | What it delivers |
| ----- | ---- | ---------------- |
| **1** | Money visibility | Transactions, cash flow, basic net worth |
| **2** | Wealth picture | Assets, liabilities, goals, health indicators |
| **3** | Guided decisions & assisted actions | Bounded simulations, recommendations, and agent-prepared transaction **drafts** the human reviews, confirms, and authenticates |

See [`docs/PRODUCT.md`](docs/PRODUCT.md) for the full product contract.

## Architectural invariants

These constraints are the reason the architecture exists and must be preserved by any change:

1. **The deterministic engine is the source of financial truth** — never the LLM.
2. **The AI is a non-committing, constrained facade** with two tool tiers: read-only analytics and draft-only actions. It cannot mutate, execute, confirm, or authenticate anything.
3. **No autonomous money movement** — every transfer is reviewed, confirmed, and authenticated by the human in the native MSB flow.
4. **UI depends on provider interfaces, not fixtures.**
5. **Every number carries provenance** (`msb` / `self_reported` / `estimated` / `mock`).
6. **Missing values stay unknown** — never silently defaulted to zero.
7. **Categories are data**, not hard-coded in presentation.

Full rationale and the request pipeline are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tech stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript 5**
- **Tailwind CSS v4**
- **Recharts** (charts) · **lucide-react** (icons)
- **Vitest** + **Testing Library** (tests)
- **@anthropic-ai/sdk** (LLM facade, server-only; provider-swappable)

## Getting started

**Prerequisites:** Node.js `>=20` (see [`.nvmrc`](.nvmrc)) and npm.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional — the app runs offline without a key)
cp .env.example .env.local   # then fill in an LLM key if you want live AI

# 3. Start the dev server
npm run dev                  # http://localhost:3000
```

The assistant degrades to deterministic templated answers when no LLM key is configured, so the app always builds and runs.

### Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint with ESLint (`next/core-web-vitals`) |
| `npm run test` | Run the test suite once (`vitest run`) |
| `npm run test:watch` | Run tests in watch mode |

### Environment variables

Server-side only — keys never reach the browser bundle. Copy [`.env.example`](.env.example) to `.env.local` (gitignored).

| Variable | Purpose |
| -------- | ------- |
| `LLM_PROVIDER` | `anthropic` (default) · `vng` (OpenAI-compatible) · `none` (force offline) |
| `ANTHROPIC_API_KEY` | Key for the default Anthropic provider (leave empty for offline mode) |
| `AI_PLATFORM_API_KEY` | Key for the VNG GreenNode provider (`LLM_PROVIDER=vng`) |
| `LLM_BASE_URL` | Optional base URL override for OpenAI-compatible providers |
| `LLM_MODEL` | Optional model override (sensible per-provider defaults otherwise) |

## Project structure

```
msb-pfm/
├── docs/                     # Source-of-truth product & architecture docs
│   ├── PRODUCT.md            #   what the product is
│   ├── ARCHITECTURE.md       #   how it is built
│   └── journals/             #   session journals
├── src/
│   ├── app/                  # Next.js App Router routes + /api/assistant
│   ├── components/           # React components, grouped by feature area
│   ├── domain/               # Deterministic calculation engine + data models
│   │   ├── engine/           #   pure, independently tested financial rules
│   │   └── models/           #   canonical types + Vietnamese category taxonomy
│   ├── insights/             # Rule-based (deterministic) insight detectors
│   ├── ai/                   # AI facade: LLM adapters, tools, pipeline, audit
│   │   ├── llm/              #   provider-neutral client + adapters (server-only)
│   │   ├── tools/            #   whitelisted read tools + draft-only tools
│   │   ├── pipeline/         #   intent → scope → tools → narrative → validation
│   │   ├── proactive/        #   bounded chat openers from existing insights
│   │   └── audit/            #   metadata-only audit events
│   ├── providers/            # Data provider interfaces + swappable mock provider
│   ├── state/                # React state (financials, insights, consent, period)
│   └── lib/                  # Framework-agnostic utilities
├── next.config.ts
├── tsconfig.json             # `@/*` → `src/*` path alias
└── vitest.config.ts
```

The `src/` layout follows Next.js's recommended "top-level folders" strategy and mirrors the module boundaries documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The `domain`, `insights`, and `ai` split is intentional: deterministic truth, deterministic insights, and the LLM facade are kept separate on purpose.

## Testing

```bash
npm run test
```

Calculation correctness is a hard gate: every financial rule has a deterministic test against fixtures, and AI numeric claims must trace to structured facts. Cover empty, loading, error, and insufficient-data states for every feature.

## Documentation

| Document | Purpose |
| -------- | ------- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Personas, the three PFM levels, screens, scope, and the AI product contract |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module responsibilities, data model, provider abstraction, AI pipeline, evolution path |
| [`CLAUDE.md`](CLAUDE.md) | Working conventions and the architectural invariants |

> Working docs (the phased plans, backlog, and research reports under `plans/`) are kept local-only and are not tracked in version control.

## Conventions

- Follow the backlog dependency order — no Level 3 work bypasses the Level 1 calculation and data-quality foundation.
- When implementing a financial rule, add a deterministic fixture test in the same change.
- Non-component `.ts` files use `kebab-case`; React components use `PascalCase`; hook files use the `useX` convention.
- Conventional Commits for commit messages.

## License

Proprietary — internal MSB prototype. Not licensed for external use or distribution.
