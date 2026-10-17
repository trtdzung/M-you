// Class strings copied from the team's existing components (design-system token classes only).
import type { GoalProgressState } from "../model/types";

const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

export const input = `min-h-11 rounded-row border border-border bg-surface px-3 text-sm text-text ${ring}`;
export const label = "text-sm font-medium text-text";
export const hint = "text-xs text-muted";
export const fieldError = "text-sm text-negative";
export const primaryButton = `inline-flex h-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50 ${ring}`;
export const secondaryButton = `min-h-11 rounded-full border border-border px-3 text-sm font-semibold text-text transition-colors hover:bg-surface-muted ${ring}`;
export const chip = `min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-text transition-colors hover:bg-surface-muted ${ring}`;
export const dangerButton = `flex min-h-11 items-center justify-center gap-2 rounded-full border border-negative/40 px-3 text-sm font-semibold text-negative ${ring}`;
export const errorBox = "rounded-row border border-negative/40 bg-negative-soft/40 px-3 py-2";
export const warningBox = "rounded-2xl bg-warning-soft px-3.5 py-3 text-sm text-text";
export const progressTrack = "h-2 w-full overflow-hidden rounded-full bg-surface-muted";
export const progressFill = "h-full rounded-full";

/** Progress state -> token classes (never red for a plan: "lệch rõ" is the strongest tone). */
export const STATE_TONE: Record<GoalProgressState, { bar: string; text: string; soft: string }> = {
  on_track: { bar: "bg-positive", text: "text-positive", soft: "bg-positive-soft" },
  ahead: { bar: "bg-positive", text: "text-positive", soft: "bg-positive-soft" },
  slightly_behind: { bar: "bg-warning", text: "text-warning", soft: "bg-warning-soft" },
  off_track: { bar: "bg-negative", text: "text-negative", soft: "bg-negative-soft" },
};
