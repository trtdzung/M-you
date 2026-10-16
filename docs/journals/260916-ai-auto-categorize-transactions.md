# 2026-09-16 — AI auto-categorization of transactions

## What changed

Shipped AI-assisted category suggestion as a **validated enrichment overlay**, not a
ledger mutation: the classifier (local heuristic today, LLM-shaped contract for later)
proposes a `categoryId` from the fixed Vietnamese taxonomy; the provider's
`Transaction.categoryId` is never touched (invariant #4). Delivered across 7 phases per
`plans/260916-1429-ai-auto-categorize-transactions/plan.md`.

- **Phase 00 — real "unclassified" data.** Added `UNCLASSIFIED` ("Chưa phân loại") as a
  sentinel that is deliberately *not* in the spendable taxonomy, with its own pinned jar
  bucket. It still counts toward total expense (never silently defaulted to 0 — invariant
  #6). Mock generator now emits ~18% unclassified discretionary spend so there is
  something real to backfill (`src/domain/categorize/unclassified.ts`,
  `src/providers/mock/fixtures/generate.ts`).
- **Phase 01 — single overlay, not a new store.** Extended the existing
  `src/state/corrections.tsx` (txn-keyed) instead of adding a third store, per red-team
  finding #7. Each correction now carries `origin` (`user | ai | memory | heuristic`),
  `status` (`applied | pending`), and `confidence`. Storage is per-cif, migrates legacy
  records, and commits via read-merge-write. A race guard ensures `upsertMany` (bulk
  AI/memory writes) can never clobber a `user`-origin assignment.
- **Phase 02 — category memory.** Per-persona `merchantNormalizedName → categoryId`
  learning store, written on user confirm/correct, validated on both read and write
  (orphan/invalid ids are forgotten, not trusted) — `src/state/category-memory.tsx`.
- **Phase 03 — classify pipeline.** `src/ai/categorize/categorize-service.ts` runs:
  eligibility filter → memory-first lookup → chunk (≤`CATEGORIZE_CHUNK_SIZE`, currently
  50) → classify → two-tier validation (syntactic: in taxonomy and not
  `UNCLASSIFIED`; semantic: proposed category kind matches the transaction's
  type/direction) → confidence gate (≥0.8 auto-applies, else `pending`). The remote path
  (`src/ai/categorize/remote-classifier.ts`) is intentionally **BLOCKED** (throws) because
  no backend contract exists yet; `src/app/api/agent/categorize/route.ts` enforces
  `user_id` + an items cap server-side and returns `501` — guards exist even though the
  backend doesn't, so the scaffold fails safe once wired up.
- **Phase 04 — trigger/orchestration.** `src/state/auto-categorize.tsx` mounts once,
  debounces, guards against overlapping in-flight runs, and is gated on consent scope
  `"ai"` (`hasScope` added to `src/lib/consent.ts`). The classifier is local, so no
  merchant text ever leaves the device; without the `"ai"` scope only prior user-taught
  memory applies (no heuristic/AI writes).
- **Phase 05 — provenance UI.** New `CategoryProvenanceBadge`, `AutoCategorizeBar`,
  `TxnSuggestionBar` surface the suggestion inline with an accept/correct 1-tap flow.
  Heuristic suggestions are explicitly labeled **"Gợi ý tự động"**, not "AI gợi ý" (red-team
  finding #9/#10 — don't misrepresent a local heuristic as an LLM). Confidence percentage
  is never rendered to the user, only used internally for the auto-apply gate.
- **Phase 06 — verification.** 500/500 Vitest, `tsc --noEmit` clean, `next lint` clean.
  Code review scored 8/10 with all 8 architectural invariants holding. Three fixes landed
  post-review: (a) a `Period` test literal missing `label` (tsc error), (b) same-tab
  consent reactivity via a `CONSENT_CHANGED_EVENT` (toggling consent in one tab wasn't
  picked up by the already-mounted auto-categorize effect in the same tab), (c)
  `local-classifier.ts` keyword matching switched to Unicode-aware word-boundary matching
  to avoid false-positive substring hits in Vietnamese merchant text.

## Why

Red-teamed the plan before coding (15 findings, 4 reviewers, all accepted) specifically to
protect the invariants: engine stays the source of truth, provider records are immutable,
provenance must be visible, and no source (LLM output *or* learned memory) gets to bypass
taxonomy/semantic validation just because it's "trusted." The decision to fold this into
the existing `corrections` store rather than add a third overlay was deliberate scope
control (YAGNI) once the red team flagged the original 3-store design as duplicative.
Keeping the remote classifier path `BLOCKED` rather than mocking a fake success avoids
"simulated implementation" and keeps the prototype honest about what still needs a signed
backend contract.

## Impact

- Backfills and newly ingested unclassified transactions can now get a suggested category
  without any AI ever writing to the transaction ledger.
- Users who never grant `"ai"` consent still benefit from anything they've previously
  taught the memory store — the feature degrades gracefully rather than going dark.
- Provenance is inspectable end-to-end (origin + status per correction), which keeps
  aggregates honest about what's bank-verified vs. suggested vs. self-corrected.

## Follow-ups

- Sign a backend `/categorize` contract, then unblock `remote-classifier.ts` and forward
  through the existing `/api/agent/categorize` proxy (guards are already in place).
- Client-side (`localStorage`) consent is not a real server-side security boundary —
  needs session infra before this leaves prototype status.
- Backlog/architecture doc entries for this feature (`PFM-0xx` item, `ARCHITECTURE.md`
  correction noting the real facade is a Python agent) are still outstanding per the plan
  — flagged as a `docs-manager` follow-up, not done in this pass.
