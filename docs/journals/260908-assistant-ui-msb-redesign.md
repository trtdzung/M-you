# 260908 — Trợ lý (AI Assistant) UI Redesign — Warm MSB Chrome + Full-Height Chat

## Problem
`/assistant` lagged the rest of the app. It lived in the `(festive)` route group, so financial chat rendered over the busy dark 2/9 photo (the same photo-bg pattern the PFM chrome-split already flagged as wrong for financial content). It also mixed two things in one page-scroll — a chat panel **and** an "Đáng chú ý" `InsightCard` feed — with the composer inline in that scroll instead of docked. Bubbles/chips carried no MSB identity.

## What shipped
Plan `plans/260908-1713-assistant-ui-msb-redesign`, all 4 phases complete. Structural + visual, **presentation-only** — no engine/provider/data-contract changes. Reused the route-group + nested-layout chrome-split pattern.

- **Route move**: `git mv src/app/(festive)/assistant → src/app/assistant` (URL unchanged — route groups don't affect the path).
- **Dedicated warm chrome** (`app/assistant/layout.tsx`, new): a `WarmBg` peach wash (no photo), then a full-height flex column — `AssistantAppBar` + `AssistantTrustStrip` + a `min-h-0 flex-1` slot for the chat. No bottom nav, no AI FAB (the FAB self-hides on `/assistant`). Status ink stays white over the cam app-bar (no `shell-calm`).
- **`AssistantAppBar`** (new, ~56px): cam `brand-gradient` bar — back arrow → Home, Sparkles mark + "Trợ lý MSB" title, and an ⓘ button toggling the full read-only disclosure (the copy that used to sit in a big card on the page).
- **`AssistantTrustStrip`** (new): compact persistent strip "Chỉ đọc · không chuyển tiền · mỗi số kèm nguồn".
- **`page.tsx`**: dropped `ScreenHeader`, the disclosure card, and the entire "Đáng chú ý" `InsightCard` list. Now reads `useInsights` solely to seed one opener from the top visible insight, and renders only `<ChatPanel>`.
- **`ChatPanel`** restructured to a full-height column: message region `flex-1 min-h-0 overflow-y-auto` is the sole scroll; `Composer` is a `shrink-0` docked footer outside it. Owns all four states (empty greeting / peach shimmer loading / `ErrorState` / no-AI-scope) inside the message region so the docked composer never disappears. Opener now seeds via a `seededRef`-guarded effect (it arrives async after `useInsights` loads — the old synchronous `useState` initializer missed it once the panel mounts during loading).
- **Reskins** (tokens only, no new assets): user bubble `bg-primary` → `brand-gradient`; `Composer` → docked bar with warm horizontally-scrolling quick-suggestion chips (opener-derived chip merged ahead of `STARTER_PROMPTS`) + round cam-gradient send; `SourceChips` → neutral `source-mock` provenance pill; `WhatIfChart` line/marker → MSB cam; `DraftCard` → transfer-success visual language (centered large amount, cam-gradient "Xem & xác nhận" CTA) with **logic frozen**.
- **Entry points**: `AssistantFab` aria-label synced to "Trợ lý MSB"; the Home header **headset** (`Headphones`, previously a no-op demo button — the MSB-native anchor for an assistant) now links to `/assistant`. `HomeHeader`'s `IconButton` gained optional `href` (renders a `Link`).
- **CSS**: added `.shell-main--assistant { padding: 0 }` sibling of `.shell-main--pfm` so the app-bar + docked composer own the edges.

## Key decisions
- **No fabricated "Phí" row on `DraftCard`.** The plan's transfer-success reference lists a fee row, but `TransferDraftView` carries no fee field — adding one would fabricate a value (violates the "missing stays unknown / never invent" invariant). Kept the real fields only.
- **Provenance pill uses the neutral `source-mock` palette, not bank-blue.** The chip shape has no per-source-type field (contract frozen) and all prototype records are `source: mock`; coloring them `msb` would falsely imply bank-verified data (invariant #5).
- **No-scope state gates on the `"ai"` consent scope**, checked in a mount effect (`aiScope: null` until checked to avoid a hydration flash); composer disabled with a hint rather than a broken chat.

## Gates passed
`next lint` clean (0/0), `next build` passes (`/assistant` emits, URL unchanged), `vitest run` **251/251** green (added a no-scope ChatPanel test + assistant chrome-separation smoke assertions). Visually verified in desktop preview at 440×956: warm app-bar + trust strip + opener bubble + provenance pill + docked chip row + cam send; no 2/9 photo, no bottom nav.

## Invariants upheld
Presentation-only — `AssistantEvent` / `UiMessage` / `TransferDraftView` / `lib/assistant-stream.ts` / the pipeline all untouched. Provenance preserved on every answer. `DraftCard` still mask-only, hands off via sessionStorage `draftId`, never executes/confirms/handles OTP. No autonomous money movement.

## Code review
`code-reviewer` — **9/10, 0 critical / 0 warnings.** All four hard invariants verified intact (no money movement, provenance preserved, engine/data contracts untouched, required states with chrome always visible). Both design calls confirmed correct (no fabricated fee row; neutral `source-mock` provenance palette). Two optional nits applied: simplified the `Composer` textarea `disabled` expression, and gitignored `.playwright-mcp/` artifacts.

## Status
Implementation complete, all gates green (lint 0/0 · build 0 errors · vitest 251/251). Awaiting commit.
