"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * Chuyển tiền's own header — back arrow + bold title + a right-side icon slot
 * — reproducing the reference screenshot's chrome exactly (not the shared
 * `ScreenHeader` used by Tài sản/Cài đặt, per explicit product direction).
 * `onBack` navigates within the 2-step flow; the browser back button still
 * works normally since this never pushes a new route.
 */
export function TransferHeader({
  onBack,
  title = "Chuyển tiền",
  rightIcon,
  rightLabel,
  onRightClick,
}: {
  onBack: () => void;
  title?: string;
  rightIcon?: ReactNode;
  rightLabel?: string;
  onRightClick?: () => void;
}) {
  return (
    <header className="flex items-center gap-2 px-4 pb-2 pt-[calc(var(--safe-area-top)+0.25rem)]">
      <button
        type="button"
        onClick={onBack}
        aria-label="Quay lại"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </button>
      <h1 className="text-xl font-bold tracking-tight text-text">{title}</h1>
      <div className="ml-auto" aria-hidden={!rightIcon}>
        {rightIcon && (
          <button
            type="button"
            onClick={onRightClick}
            aria-label={rightLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {rightIcon}
          </button>
        )}
      </div>
    </header>
  );
}
