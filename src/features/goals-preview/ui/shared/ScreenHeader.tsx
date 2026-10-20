"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNav } from "../../store/PreviewStore";
import { ring } from "./styles";

/**
 * Back arrow + bold title (same chrome as GoalsHeader). Back pops the in-store
 * screen stack unless `onBack` is given. `right` holds one optional icon action.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  hideBack,
  right,
  compact = false,
  plain = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  hideBack?: boolean;
  right?: ReactNode;
  compact?: boolean;
  plain?: boolean;
}) {
  const nav = useNav();
  const showBack = !hideBack && (onBack !== undefined || nav.canGoBack);
  return (
    <header className={`flex items-center gap-2 px-1 ${plain ? "relative bg-transparent" : `sticky top-0 z-20 bg-[#f8e2d8] ${compact ? "" : "rounded-b-2xl"}`} ${compact ? "py-2" : "py-3"}`}>
      {showBack && (
        <button
          type="button"
          onClick={onBack ?? (() => nav.pop())}
          aria-label="Quay lại"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 ${ring}`}
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[20px] font-bold leading-7 text-text">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
