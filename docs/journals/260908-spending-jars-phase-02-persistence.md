# 260908 — Spending Jars: Phase 02 (Persistence — provider seam + config context + seed + wiring)

## What shipped
Phase 02 of `plans/260908-1311-spending-jars/` — first write path in the provider layer, a jar-config context, a seed template, and wiring into `useFinancials`. Still no jar UI.

- **`src/providers/interfaces.ts`**: first WRITE methods on `Providers` — `getJarConfig(): Promise<JarConfig | null>` and `saveJarConfig(config): Promise<void>`.
- **`src/providers/mock/mock-provider.ts`**: backs them with persona-scoped `localStorage` (key `msb-pfm.jars.<personaId>`) guarded by an `isValidJarConfig` schema/version check — corrupt, absent, or wrong-shape storage resolves to `null` (caller seeds) rather than throwing. `createMockProvider` now takes `personaId`, threaded through `src/providers/index.ts`.
- **`src/domain/models/jar-defaults.ts`** (new): `DEFAULT_JAR_CONFIG` seed — spend-only, all 10 expense categories, percents sum to 100 (Thiết yếu 65 / Ăn uống 15 / Hưởng thụ 20). Category IDs validated against the taxonomy.
- **`src/state/jars.tsx`** (new): `JarConfigProvider` + `useJarConfig`. Loads via provider on mount and on persona switch, seeds from the default when absent, persists on every mutation, and exposes CRUD (`addJar` / `updateJar` / `removeJar` / `assignCategory` / `setAllocation` / `setIncomeBasis` / `resetToSeed`) enforcing one-category-one-jar.
- **`src/state/useFinancials.ts`**: threads the live `jarConfig` into `computeFinancials` (added to the memo dependency list). `JarConfigProvider` mounted in `src/app/providers.tsx` and in both manual test trees (`routes.smoke`, overview-overflow).
- **Tests**: `jar-defaults.test.ts` (seed validation), `providers/mock/__tests__/jar-config.test.ts` (round-trip, schema guard, persona isolation), `state/__tests__/jars.test.tsx` (CRUD invariants via `renderHook`, dedupe-on-load, persona-switch reload).

## Decisions / fixes from code review
`code-reviewer` agent: **6.5/10, 0 critical.** Three warnings fixed before closing:
1. Moved `saveJarConfig` out of the `setState` updater into a plain side effect plus a `configRef` mirror, so persistence fires once under StrictMode and chained mutations within one tick always save the latest value.
2. Added `dedupeCategories()` applied to any config loaded from storage — a structurally-valid-but-overlapping config (same category in two jars) would otherwise make `evaluateJars` double-count that category's spend.
3. Added the dedicated `JarConfigProvider` CRUD test file — the module previously had none.

Also strengthened H5: reset to the seed synchronously on persona switch so another persona's allocations never flash on screen for a tick.

Deferred to Phase 04 (setup UI): `addJar` currently trusts the caller-supplied `id` with no uniqueness guard/generation — carried forward as a Todo in `phase-04-setup-route.md`.

## Gates
`vitest` 219/0 passing, `tsc --noEmit` clean. `npm run lint` remains broken repo-wide (pre-existing ESLint v9 config-migration gap) — unrelated, not a regression.

## Status
Work is **on disk, not yet committed** — awaiting user decision. Plan tracker synced: phase-02 marked complete, phase-03/phase-04 unblocked. `docs/ARCHITECTURE.md`'s spending-jars subsection extended to cover persistence. `docs/PRODUCT.md` untouched (no UI shipped yet).

## Follow-ups
- Phase 03/04: jar setup UI (jar cards, allocation editor), including the id-uniqueness guard deferred above.
- Commit the pending Phase 01 + Phase 02 changeset when ready.
