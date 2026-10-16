# 2026-09-16 — Wire a real LLM (VNG GreenNode) into the auto-categorizer

## What changed

Follow-on to yesterday's auto-categorize slice (`260916-ai-auto-categorize-transactions.md`),
which shipped a local heuristic plus a deliberately BLOCKED remote path. This increment
replaces the blocked path with a working VNG GreenNode (OpenAI-compatible MaaS) model,
without loosening any safety invariant.

- **`src/ai/llm/`** (new, provider-neutral):
  - `types.ts` — `LlmClient` contract: `complete(messages, options) -> string`. Text only —
    the client never returns a number the engine consumes.
  - `openai-compatible-client.ts` — GreenNode adapter (`.../v1/chat/completions`, Bearer
    key, `AbortSignal.timeout(15_000)`). Marked `server-only`.
  - `index.ts` — `getLlmClient()`: env-driven provider select (`LLM_PROVIDER` explicit, else
    inferred `vng` if `AI_PLATFORM_API_KEY` is set, else `anthropic`). Only `vng` has an
    adapter in this slice; anything else resolves to `null` (offline) — with a one-line
    `console.warn` footgun guard when a GreenNode key is present but a provider with no
    adapter is pinned. Default model `qwen/qwen3.6-flash`. `server-only` — the key cannot
    reach the browser bundle (build error if imported client-side).
- **`src/ai/categorize/prompt.ts`** (new): fixed-taxonomy system prompt (JSON-only output,
  merchant/note explicitly framed as DATA not instructions — prompt-injection posture) and
  a tolerant `parseCategorizeResults` that never throws on malformed model output (bad JSON
  → `[]`, not a crash).
- **`src/app/api/agent/categorize/route.ts`** (rewritten): same-origin proxy. Guards:
  `user_id` required (400), `items` capped at `CATEGORIZE_CHUNK_SIZE` (400 over cap), each
  item coerced to a minimal `ClassifyInput` (untrusted body, whitelisted fields only).
  `max_tokens` sized to the batch (`items.length * 48 + 256`, capped 4096) so a full-chunk
  JSON array isn't silently truncated. No client configured → 501 (offline signal); upstream
  throw → 502 with server-side-only `console.error` (no key/detail leaked to the client).
- **`src/ai/categorize/remote-classifier.ts`** (rewritten): `createRemoteClassify(userId)`
  returns a `ClassifyFn` that calls the proxy same-origin (no client-held key). Throws on
  non-2xx **or** on empty results for a non-empty batch (truncation guard) so a silently
  useless 200 still counts as a chunk failure and triggers fallback.
- **`src/state/auto-categorize.tsx`**: with "ai" consent granted, chunks route through the
  real LLM tagged `origin: "ai"`; a chunk failure (network, 501, 502, or the truncation
  guard) degrades that chunk to the local heuristic, tagged `origin: "heuristic"` — honest
  provenance either way, never mislabelled.

## Why

The prior slice proved the pipeline shape (consent gate → chunked classify → confidence-gate
→ overlay) with a stubbed remote path. This slice makes the remote path real while keeping
the architecture's non-negotiables: the LLM only ever produces a text suggestion; every
suggestion is re-validated syntactically and semantically and confidence-gated in
`categorize-service` before it can become a category overlay (invariant #1/#7 — engine
stays the source of truth, model is untrusted). Provider selection is env-driven and
adapter-isolated so a future Anthropic (or other) adapter is one file, not a pipeline change.

## Verification

- 548/548 tests passing (48 new this slice: LLM client, prompt build/parse, route guards,
  remote-classifier fallback/truncation behavior).
- `tsc` clean, lint 0 errors / 0 warnings.
- Code review: 6.5/10 initial — all 4 stated safety invariants held in code, but flagged
  five issues, all fixed before landing:
  1. A docs privacy claim was overstated — corrected to match actual behavior.
  2. No upstream request timeout — added 15s `AbortSignal.timeout`.
  3. Fixed `max_tokens` risked truncating large batches silently — sized to batch, plus the
     empty-result-on-non-empty-batch guard in `remote-classifier.ts`.
  4. Upstream errors had no server-side trace — added `console.error` in the route.
  5. Env-provider mismatch (key present, wrong `LLM_PROVIDER`) failed silently — added the
     one-line warn in `getLlmClient()`.

## Known prototype limits (not fixed here, tracked for pilot)

- The `/api/agent/categorize` proxy route has **no server-side auth/session** — `user_id` is
  client-supplied and spoofable, and there's no rate limiting. A real, paid model now sits
  behind this route, so it's an oracle/cost-abuse surface in its current form.
- "ai" consent is enforced client-side only (`auto-categorize.tsx` gate); there's no
  server-side consent check on the route itself.
- To exercise the real model: set `LLM_PROVIDER=vng` and `AI_PLATFORM_API_KEY=...` in
  `.env.local` (gitignored, never committed — see `.env.example`).

## Follow-ups

- Add server-side session/auth + rate limiting to the categorize proxy before any pilot
  traffic touches a paid model.
- Move consent enforcement server-side (or double-check it there) once session infra exists.
- Anthropic adapter is documented in `.env.example` but not implemented — add when needed,
  same one-file pattern as the GreenNode adapter.
