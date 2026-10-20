/**
 * Class strings for goals-preview, aligned with Tổng quan type scale
 * (SectionHeader / PfmHeader / jar cards). Tap targets ≥ 44px.
 */

export const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

export const input = `min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text ${ring}`;
export const label = "text-sm font-medium text-text";
export const hint = "text-xs leading-5 text-muted";
export const fieldError = "text-sm text-negative";

/** One per screen. */
export const primaryButton = `inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg transition-opacity disabled:opacity-50 ${ring}`;
export const secondaryButton = `inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-muted disabled:opacity-50 ${ring}`;
export const ghostButton = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-soft/60 ${ring}`;
export const dangerButton = `inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-negative/40 bg-surface px-4 text-sm font-semibold text-negative ${ring}`;
export const chip = `inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3.5 text-sm font-semibold text-text transition-colors hover:bg-surface-muted ${ring}`;
export const chipSelected = `inline-flex min-h-11 items-center rounded-full border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-fg ${ring}`;

export const card = "rounded-card bg-surface p-4 shadow-card";
export const listRow = `flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted ${ring}`;
export const divider = "divide-y divide-border";

/**
 * Type scale synced to Tổng quan (px): 18 hero/figure (text-lg) · 20 page title ·
 * 16 section title (text-base) · 14 card title / body / button (text-sm) · 12 caption (text-xs) · 11 meta.
 */
export const sectionTitle = "text-base font-semibold text-text";
export const heroNumber = "text-lg font-bold leading-none tabular-nums text-text";
export const figure = "text-lg font-bold leading-none tabular-nums text-text";
export const emphasisTitle = "text-[20px] font-bold leading-7 text-text";
export const calloutTitle = "text-sm font-semibold leading-5 text-text";
export const screenPadding = "flex flex-col gap-4 pb-6";

export const warningBox = "rounded-2xl bg-warning-soft px-3.5 py-3 text-sm text-text";
export const infoBox = "rounded-2xl bg-surface-tint px-3.5 py-3 text-sm text-text";
export const errorBox = "rounded-2xl border border-negative/40 bg-negative-soft/40 px-3.5 py-3 text-sm text-text";
export const successBox = "rounded-2xl bg-positive-soft px-3.5 py-3 text-sm text-text";

export const progressTrack = "relative h-2.5 w-full overflow-hidden rounded-full bg-surface-muted";

/** Sticky bottom bar for the screen's single primary action. */
export const bottomBar =
  "sticky bottom-0 z-10 mt-2 flex flex-col gap-2 bg-[linear-gradient(to_top,#f7d4d6_70%,rgba(247,212,214,0))] pb-[calc(16px+var(--safe-area-bottom,0px))] pt-4";
