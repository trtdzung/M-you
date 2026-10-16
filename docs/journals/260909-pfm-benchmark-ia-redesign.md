# 260909 — PFM Benchmark IA Redesign (4-Question cockpit spine)

All 8 phases of `plans/260909-1519-pfm-benchmark-ia-redesign/` implemented in one
session — reorganizes `/pfm` around MSB's product thesis, on top of the same-day
Hũ balance-lens rewrite. Goal (user-locked): TIMO's capability breadth + BIDV's
shallowness, fidelity inspired-not-copied. Source: `brainstorm-260909-pfm-benchmark-ia-redesign.md`.

## What shipped

New 4-tab IA at `/pfm`, one tab per product question:
- **Tổng quan** ("Bao nhiêu tiền?") — net worth headline, TK/thẻ, Tài sản & Nợ
  summary tile with one-tap drill, provenance footer.
- **Dòng tiền** ("Tiền đi đâu?") — sub-hub docking **Giao dịch · Hũ · Báo cáo**
  behind an inline segmented control (`?dock=` param), not 4 separate tabs/modules.
- **Kế hoạch** ("Cuối tháng ổn? / Làm gì?") — Mục tiêu (goal) CRUD, surplus
  what-if, health indicators, mô phỏng.
- **Trợ lý** ("Làm gì tiếp?") — copilot entry, insights feed, universal-jump
  deep-links.

Net-new surfaces: `WealthManager` (Tài sản & Nợ CRUD at `/pfm/wealth`,
`self_reported` provenance), `AdvisoryReport`/`BriefSection` (deterministic
Báo cáo — rule-based "nghĩa là gì + nên làm gì" highlights, no LLM), `PlanTab`
+ goal CRUD, `AssistantTab`, `resolveIntentRoute` (`src/lib/copilot-nav.ts`) —
a static intent→route whitelist (8 intents, strict param enum) so copilot
replies can "jump" the user to a screen via a tappable CTA only, never by
pushing navigation itself.

Legacy `Ngân sách` module fully retired: Hũ is the single budgeting concept
(term-lock, zero user-facing "Ngân sách" occurrences left in `src/`).

## Key architectural decisions

- **CRUD user-state threaded like Hũ.** User assets/liabilities/goals are
  merged as `ComposeOptions` fields into `computeFinancials`'s `useMemo` —
  single source of truth. Provider `listAssets()`/`listLiabilities()` stay
  **seed-only reads**; the context is the only place seed + user records are
  merged, so nothing double-counts.
- **One shared persistence helper.** Both CRUD subsystems (assets/liabilities
  in P03, goals in P05) sit on a generic `personaLocalStorageResource<T>()` /
  `userRecordStore<T>()` — versioned store envelope, per-record guard (drops
  only malformed elements, never wipes the whole store), persona-isolated keys.
  Built generic in P03 specifically so P05 could reuse it with zero contract
  changes.
- **Báo cáo is deterministic-only for this pass.** LLM narration of the
  advisory brief was scoped out at red-team time (injection/timeout/pipeline-
  shape risk not worth it before the IA itself is validated) — explicit,
  documented deferral, not an oversight.
- **Copilot jump is a whitelist, not LLM authority.** `resolveIntentRoute`
  maps a closed set of intents to routes with strict enum validation on
  params; unknown intent/param falls back safely. The LLM can suggest a jump,
  but only a tappable CTA actually navigates — no autonomous `router.push`.

## Execution shape

7 phases (P04 folded into P03) run auto-through with per-phase `fullstack`
subagents, gated on `tsc`/build/test at each step. P03→P05 were forced
**serial**, not parallel, because both touch the same 5 shared files
(`interfaces.ts`, `mock-provider.ts`, `finance-compose.ts`, `useFinancials.ts`,
`providers.tsx`) — running them in parallel would have collided. P07 (copilot
`resolveIntentRoute`) was run **before** P06 (Báo cáo) so P06's advisory CTAs
had a jump target to wire into.

## Red-team review

28 raw findings → 15 accepted (4 Critical, 6 High, 5 Medium) before
implementation, incl.: universal-jump `?tab` never re-synced by `PfmTabHost`;
CRUD threading via stale `raw` reads causing double-count; P03/P05 file
collision (→ forced serial); whole-store reseed silently deleting user
records (→ per-record guard); Báo cáo LLM narration scope creep (→ deferred).
All 15 applied inline during phase implementation.

## Post-implementation review fixes

Adversarial code review scored **6.5/10**, found 4 issues, all fixed before
close:
1. `tsc --noEmit` failure — a test helper was missing a `goals` field; passed
   `next build` (Next excludes test files from its type-check) but failed
   strict `tsc`.
2. Two dead-end nav taps in `OverviewTab` — hero tap and the Sức khỏe tile had
   no real destination; repointed to `/pfm/wealth` and the `plan` tab
   respectively.
3. Stale `/wealth` redirect target — pointed at the old route shape, fixed to
   `/pfm/wealth`.

## Migration cleanup (P08)

Deleted 2 confirmed-orphaned components (`WealthView.tsx`, `BudgetList.tsx` —
grep-verified no live importers). Audited every legacy deep link
(`/cashflow`, `/wealth`, `/pfm/cashflow`, `/pfm/jars`, `/pfm/insights`) —
all resolve via `redirect()`, no dead ends. Re-verified all 4 hard gates
(Σ hũ ≡ số dư, net-worth-with-user-records, goal projection parity chat vs
direct-tap, intent→route mappings) and the empty/loading/error/insufficient-
data matrix across all 6 new/changed surfaces.

## Outcome

- `tsc --noEmit` clean, `next build` OK (20 routes), `next lint` 0/0.
- 326 tests passing (+66 from session start), 48 test files.
- Term hygiene: "Ngân sách" now zero user-facing hits (only 2 code comments
  documenting its removal + `ref/BIDV/*` competitor material).

## Status

Work is **on disk, not yet committed** per user request (branch
`feat/hu-balance-lens-partition` already carries the Hũ rewrite ahead of this).

## Follow-ups

- LLM narration for Báo cáo — deliberately deferred (red-team #5), revisit
  once the IA itself is validated.
- Manual visual QA for pixel-accurate no-scroll at 375×667 (reference content
  + worst-case fixture: 12 self-reported mortgages, ~72-char VN names, ~9.5B
  aggregate) — jsdom asserts the structural contract (`overflow-hidden`, all
  tiles present, no per-row leak) but cannot measure rendered layout/height.
- Commit scoping/timing is a user decision (this + the Hũ rewrite are both
  uncommitted on the same branch).
