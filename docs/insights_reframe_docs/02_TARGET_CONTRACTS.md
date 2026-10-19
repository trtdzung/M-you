# 02 — Target architecture and contracts

## 1. Layering target

```text
Providers / validated profile / corrected transactions
               ↓
Existing deterministic engine (computeFinancials + pure helpers)
               ├── Health facts → Financial Health Score (Bảng 2)
               └── Insight detectors / candidates (Bảng 3)
                                ↓
                 Dispatcher / dedupe / lifecycle
                                ↓
         validated narrative (template first; LLM optional)
                                ↓
           existing API contract → Home widget / feed
```

Keep these boundaries:

- `src/domain/engine/*`: pure calculation of financial facts and, in a separate pure module, health scoring from explicit facts.
- `src/insights/*`: rules that turn financial facts into insights/candidates. Do not put user messaging, network calls, SQLite, or JSX inside detectors.
- `src/lib/*` and `src/app/api/*`: data access, persistence, cache, external model calls, request validation, response boundary.
- `src/components/*`: display validated DTOs and dispatch user-confirmed UI actions.

Do **not** put all four insight groups in a new `src/domain/engine/low-level-insights.ts`. Insight rules already have a proper home under `src/insights/`.

## 2. Type design guidance

Before adding types, reuse or extend `DataSource`, `Insight`, `InsightFact`, `FinancialHealth`, `ProactiveCandidate`, `SnapshotCandidate`, and `HomeInsight` where each is already appropriate. Avoid creating three types that all mean “an insight”. Introduce a new shared contract only where existing contracts cannot represent needed semantics.

### Financial health — proposed contract shape

The following is design guidance, not code that must be copied verbatim. Adapt it to repo conventions and keep the input explicit.

```ts
export type HealthPillar = "SPEND" | "SAVE" | "BORROW" | "PLAN_PROTECT";
export type HealthMetricId =
  | "SPENDING_TO_INCOME"
  | "PAYMENT_TIMELINESS"
  | "CASH_RUNWAY"
  | "SAVINGS_RATE"
  | "DEBT_SERVICE_RATIO"
  | "CREDIT_BEHAVIOR"
  | "GOAL_PROGRESS"
  | "INSURANCE_COVERAGE";

export interface HealthMetricFact {
  id: HealthMetricId;
  pillar: HealthPillar;
  rawValue: number | boolean | null;
  rawUnit: "ratio" | "months" | "boolean" | "score_0_100";
  score: number | null; // 0..100; null means not computable
  weight: number;       // baseline weight, 0.125 for the prototype policy
  source: DataSource | "derived";
  period: string | null;
  asOf: string | null;
  reasonUnavailable?: string;
  assumptions: string[];
}

export interface FinancialHealthScoreResult {
  policyVersion: string;
  overallScore: number | null;
  tier: "healthy" | "coping" | "vulnerable" | null;
  scoreCoverage: number; // raw configured weight available, 0..1; do not use post-normalization coverage
  availablePillars: HealthPillar[];
  metrics: HealthMetricFact[];
  pillarScores: Record<HealthPillar, number | null>;
  computedAt: string;
}
```

Implementation requirements:

- Keep `HealthMetricFact.source` in line with the domain `DataSource`; if the current code also uses `derived` or `pfm_config`, model that deliberately rather than silently widening the existing bank-source type everywhere.
- Keep the score calculation pure. Put thresholds and point mappings in a named `HEALTH_SCORE_POLICY` constant, with a `policyVersion`.
- The `score` field is the normalized component score; `rawValue` is the observed metric. Do not confuse the two.
- `scoreCoverage` uses baseline configured weights (8 × 12.5% in the default prototype policy), not the renormalized weights used to compute an available-data score.
- Each metric should retain its own provenance/freshness and a human-readable reason when unavailable. Do not use a generic “data is complete” number to paper over unknown critical inputs.

### Insight candidate / action design

- Existing `Insight` is suitable for the current rule feed, and `ProactiveCandidate` is suitable for the current DB-backed Home implementation. Prefer an adapter between existing shapes over a wholesale rewrite.
- The currently active Home DTO supports only `candidate.action: "overview" | "chat"`; those are the only actions the current widget can execute. Never return unsupported action names.
- If new chips are introduced, implement a discriminated union and a server-side allowlist. UI click must only navigate or create a reviewable draft. Money movement still requires native review, confirmation, and authentication.
- Do not let model output set URLs, amounts, product IDs, severity, priority, or rule state.

## 3. Default v0 score policy (provisional prototype index)

The baseline policy is an editable prototype policy, not the official or licensed FHN FinHealth Score. Make it centralized and versioned; do not bury thresholds in JSX.

### Pillars and baseline weights

Four equally weighted pillars: Spend, Save, Borrow, Plan & Protect (25% per pillar). Two metrics per pillar (12.5% baseline weight each):

| Pillar | Metric | Raw input and score mapping |
|---|---|---|
| Spend | `SPENDING_TO_INCOME` | `r = posted eligible expenses / posted income` over 3 months. `r <= 0.7 → 100`; linearly interpolate `(0.7,100)` to `(1.0,50)` to `(1.3,0)`; `r > 1.3 → 0`. Require positive income and adequate coverage (at least 2 observed income months); otherwise null. |
| Spend | `PAYMENT_TIMELINESS` | `100 × on-time confirmed due obligations / confirmed due obligations` over a defined window. Null unless the source can confirm both due obligations and their actual payment status. No observed penalty is not proof of on-time payment. |
| Save | `CASH_RUNWAY` | Months of liquid reserve / average monthly essential spend. Piecewise: `m <= 0 → 0`; `(0,30)` at 1 month; `(30,75)` at 3 months; `(75,100)` at 6 months; cap 100 above 6. If essential-spend denominator is only estimated, retain `estimated` provenance. |
| Save | `SAVINGS_RATE` | `s = eligible net accumulation / posted income` over 3 months. `s <= 0 → 0`; `0<s<0.1 → 700s`; `0.1<=s<0.2 → 70 + 300(s-0.1)`; `s>=0.2 → 100`. Null when income or actual accumulation cannot be measured. Do not treat every transfer to a savings account as new wealth if internal transfers could be double-counted. |
| Borrow | `DEBT_SERVICE_RATIO` | `d = monthly confirmed/estimated debt service / average monthly income`. `d=0 → 100` only if liabilities are affirmatively confirmed complete; `0<d<=0.30`: interpolate 100→70; `0.30<d<=0.45`: interpolate 70→0; `d>0.45 → 0`. Null if debt coverage or income is unknown. Estimated minimum payments must remain labeled as estimates/proxies. |
| Borrow | `CREDIT_BEHAVIOR` | Null by default until a permitted, trustworthy credit-behavior source and a versioned mapping to 0–100 are provided. Do not invent a credit score from transaction data. |
| Plan & Protect | `GOAL_PROGRESS` | For goals with `targetAmount > 0`, score the current completion ratio `clamp(currentAmount / targetAmount, 0, 1) × 100`; average valid goal scores. No goal or invalid target → null, not 0. This is completion, not “on-schedule” progress because `Goal` lacks a start date and contribution history. |
| Plan & Protect | `INSURANCE_COVERAGE` | Confirmed `true → 100`, confirmed `false → 0`, unknown → null. Use explicit self-report or a valid product record. The absence of a premium transaction cannot prove absence of coverage. |

### Aggregation and score display

1. Score each metric independently, clamp valid score to `[0,100]`, keep unavailable score as `null`.
2. Within each pillar, average only that pillar's computable component scores. If neither component is available, pillar score is `null`.
3. Average available pillar scores equally. This avoids a pillar with more available sub-metrics dominating the score.
4. Display `overallScore: null` unless at least **3 of 4 pillars** and at least **5 of 8 metrics** are computable. The threshold is a product default to validate, not a universal finance standard.
5. `scoreCoverage` is the sum of baseline weights for computable metrics (0..1). Keep it independent from renormalization.
6. For a valid overall score, provisional tiers are `healthy >= 80`, `coping >= 55`, `vulnerable < 55`. Keep thresholds named/versioned and label them as prototype categories; do not claim FHN endorsement.
7. Do not penalize “goal not created”, “no credit-bureau source”, “insurance not yet disclosed”, or an unknown liability profile as if the customer had a zero score for a verified bad outcome. Use null and explain missing evidence.

## 4. Relationship to `computeFinancials`

Do not blindly append every health calculation to `computeFinancials`. First implement and test a pure `scoreFinancialHealth(facts, policy)` function. Derive facts from existing `Financials` and source records in a separate pure composer/helper. Only expose it through `Financials` if that keeps a single coherent calculation surface and does not introduce a client/server data mismatch. The 3-month cashflow window, eligible savings numerator, and data-completeness checks must be explicit and tested.

## 5. LLM narrative contract

- The current active Home path may call an external agent for title/body selection through `home-insight-service.ts`; always keep deterministic fallback available.
- Send only selected candidate facts needed for copy. Never send account numbers, complete transaction rows, credentials, or raw full profiles.
- Treat merchant/category names and transaction notes as data, never instructions.
- Narratives must not contain new amounts, dates, rates, causes, severity, or product eligibility. Use structured numbers from engine output separately.
- If output fails schema, policy, length, numeric, action, or grounding checks, use approved deterministic copy.

## 6. External references

- FHN financial health measurement resources: https://finhealthnetwork.org/financial-health/measurement/ — use to contextualize the four pillars; do not copy/proclaim the official FinHealth Score without appropriate validation, licensing/partnership, and product/legal review.
- Gemini 3.8 Flash model documentation: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash — the coding-agent model identifier is `gemini-3.8-flash`. This task does not require a Gemini runtime dependency in the PFM application.
