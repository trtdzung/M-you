"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Card gập được kiểu màn Tài sản MSB: icon + label + chevron; mở ra content.
 * Presentation-only; state cục bộ.
 */
export function AccordionCard({
  icon: Icon,
  label,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="shadow-card overflow-hidden rounded-[24px] bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center gap-3 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
      >
        <Icon size={22} strokeWidth={1.8} className="text-text" />
        <span className="flex-1 text-base font-bold text-text">{label}</span>
        <ChevronDown
          size={20}
          strokeWidth={2}
          className={cn(
            "text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4">{children}</div>
      )}
    </div>
  );
}
