# 260908 — PFM Chrome Separation + Calm Surface Redesign

## Problem
`/pfm/*` inherited the global festive shell because `RootLayout` mounted one universal `PhoneShell` that hard-coded the festive skin (2/9 Quốc khánh photo background + scrim) for every route. Result: financial cards rendered over a busy photo, and PFM stacked two navigations at once — the 3-tab MSB `BottomNav` *and* PFM's own 4 segmented tabs.

## What shipped
Plan `plans/260908-1600-pfm-chrome-redesign`, all 5 phases complete. Structural, presentation-only fix via Next.js route-group chrome split + nested layouts:

- **`PhoneShell`** made chrome-agnostic — gained `background` / `nav` / `fab` / `className` / `mainClassName` slots; hard-coded festive bg + scrim removed.
- **`RootLayout`** thinned to `<html><body><AppProviders>` only; providers now sit above `PhoneShell` (verified safe — no provider reads chrome DOM).
- **`app/(festive)/layout.tsx`** (new) carries the festive bg + `BottomNav` + FAB. 11 non-PFM route folders `git mv`-ed into `(festive)/` — route groups don't affect the URL path, so all routes are unchanged.
- **`app/pfm/layout.tsx`** (new): calm peach `CalmBg`, `PfmHeader` back-arrow sub-app header, restyled FAB, **no bottom nav** — the 4 segmented tabs are the sole PFM navigation. New `.shell-main--pfm` CSS class reclaims the ~104px bottom-nav clearance.
- **`StatusBar`** ink made token-driven (`--shell-ink`, default white for the dark festive photo; `.shell-calm` sets it navy on the calm surface) — a small addition beyond the plan, needed to preserve AA contrast on the light PFM surface.
- **`PfmTabs`** restyled for the calm surface: dropped photo-era `backdrop-blur`; active label switched to `text-primary-strong` for AA contrast.
- Smoke tests updated for the moved import paths, plus new assertions guarding the chrome separation itself (PFM: no `BottomNav`, no `bg-2-9`, has `PfmHeader`, 4 tabs; festive routes: keep both bg and `BottomNav`).

## Key decision
Chose route groups + nested layouts over a pathname conditional inside one mega-shell component. Keeps the two design systems (festive vs. calm) in separate files (KISS/DRY), and Next.js child layouts can only *add* chrome, never remove parent chrome — which is precisely why `RootLayout` had to be thinned first and the non-PFM routes moved into their own `(festive)` group rather than left at the root.

## Gates passed
`next lint` clean, `next build` passes (all 19 routes resolve at unchanged URLs), `vitest run` 248/248 green. Code review: 9/10, 0 critical findings.

## Invariants upheld
Presentation-only change — no calculation, provider, or provenance logic touched. UI still reads exclusively through providers/hooks.

## Status
Committed as two logical commits (split per user request):
- `c344d14` — `feat(pfm): overview cockpit + supporting engine` (pre-existing uncommitted cockpit work from the prior session, committed first).
- `58fcfa8` — `refactor(shell): separate PFM chrome from the festive shell` (this session's work).

## Follow-ups
- None outstanding from this change; chrome split is a clean base for any future non-PFM sub-apps that need their own header/nav treatment.
