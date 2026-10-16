---
type: journal
date: 2026-09-06
topic: MSB UI pixel-parity redesign — 3-tab banking IA + Home screen clone
---

# MSB UI Pixel-Parity Redesign Complete

## Context

Executed the full 8-phase plan at
`plans/260906-2057-msb-ui-pixel-parity-redesign/` end-to-end in dependency
order. Goal: move the prototype from a 5-tab generic PFM layout to the
3-tab MSB banking information architecture, with the Home screen cloned
pixel-perfectly against the MSB reference design.

## What changed

**Navigation / IA**
- Bottom nav collapsed to 3 tabs: Trang chủ (`/`) · Tài khoản (`/accounts`,
  `/transactions`) · PFM (`/pfm`), plus a floating `AssistantFab` →
  `/assistant`.
- Legacy `/cashflow` and `/wealth` routes now redirect into the new `/pfm`
  hub rather than being deleted, to avoid breaking existing links/tests.

**Home (`src/app/page.tsx`)**
- Hero gradient header, `AccountSummaryCard` (masked account •••• 1991,
  hide/show balance toggle, privacy-by-default), 6-action quick grid, promo
  carousel — matched to the MSB reference pixel-for-pixel.

**Accounts tab**
- List (`/accounts`) → detail (`/accounts/[id]`), sharing a new
  `TransactionListSection` component between list and detail views.

**PFM hub (`/pfm`)**
- Net worth + cashflow summary + obligations, entry cards into
  `/pfm/{cashflow,wealth,insights}`.

**Settings (`/settings`)**
- Consent scope view + revoke, `PersonaSwitcher`, About — reachable in ≤2
  taps from the account card (entry point chosen over a header gear icon).

**Privacy hardening**
- Transfer draft hand-off moved off the URL and into `sessionStorage`
  (`src/lib/transfer-draft-store.ts`) — only an opaque `draftId` now
  travels in the URL. This closes Red Team finding #11 (draft payload
  previously leaked into browser history/URL).
- Account numbers masked to last-4 everywhere in the UI
  (`maskAccountNumber` in `src/lib/format.ts`); `Account` model gained
  `tier` and `maskedNumber` fields (mock/display-only, never read by the
  calculation engine).

**Tests**
- Phase 07 added `src/app/__tests__/routes.smoke.test.tsx` — 12 route
  smoke tests covering the new IA.

## Key decisions / deviations from plan

- Chose a single M2 build path over an M1→M2 re-pointing migration —
  simpler, avoids a throwaway intermediate state.
- Masked account number to last-4 even though the MSB reference screenshot
  shows the full number — privacy-by-default takes precedence over strict
  visual parity here.
- Settings entry point is the account card, not a header gear icon.
- `/transactions` kept as a standalone consolidated view rather than being
  redirected/folded into `/accounts`.
- `/consent` kept as a real, standalone route (not folded into
  `/settings`) specifically to avoid a `ConsentGate` redirect loop.

## Verification

- `next build`: 0 errors, 17 routes.
- `vitest`: 148 passing across 24 files.
- `next lint`: 0 warnings.
- Code review: 8.5/10, 0 critical findings. All CLAUDE.md invariants
  re-verified intact: no autonomous money movement, masked-only draft
  hand-off, engine purity (mock fields not read by calculations),
  provider-interface-only data access, and provenance preserved.
- Applied one review fix: `AccountDetailHeader` now hides the balance by
  default, matching the Home card's privacy-by-default behavior.

## Follow-ups

- None outstanding from this session; plan closed as complete.
