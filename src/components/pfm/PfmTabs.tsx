"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

export const PFM_TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "hu", label: "Hũ" },
  { id: "cashflow", label: "Dòng tiền" },
] as const;

export type PfmTabId = (typeof PFM_TABS)[number]["id"];

export function isPfmTab(value: string | null | undefined): value is PfmTabId {
  return !!value && PFM_TABS.some((t) => t.id === value);
}

/**
 * Segmented tab bar for the single-route PFM screen. Client-side switching only
 * (no navigation). Accessible: role=tablist/tab with roving focus + arrow keys.
 */
export function PfmTabs({
  active,
  onChange,
}: {
  active: PfmTabId;
  onChange: (id: PfmTabId) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (index + dir + PFM_TABS.length) % PFM_TABS.length;
    onChange(PFM_TABS[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Phân mục PFM"
      className="flex gap-1 rounded-full bg-surface-muted p-1"
    >
      {PFM_TABS.map((tab, i) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`pfm-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`pfm-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex-1 rounded-full px-2 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 min-h-[44px]",
              selected ? "bg-surface text-primary-strong shadow-card" : "text-muted hover:text-text",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
