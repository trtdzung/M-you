import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "plain" | "tint" | "hero";
type Padding = "normal" | "snug" | "none";

const VARIANTS: Record<Variant, string> = {
  plain: "bg-surface text-text shadow-card",
  tint: "bg-surface-tint text-text shadow-card",
  hero: "brand-gradient text-primary-fg shadow-card",
};

// Single card padding scale so every card breathes the same. `normal` is the
// default section-card padding; `snug` for denser chart/list cards; `none` when
// the card wraps its own padded rows (e.g. a divided list).
const PADDINGS: Record<Padding, string> = {
  normal: "p-5",
  snug: "p-4",
  none: "",
};

/**
 * Rounded surface container — MSB style: borderless, rất tròn (`rounded-card`),
 * soft shadow. `variant`: plain (trắng) · tint (peach) · hero (gradient thương
 * hiệu). `padding` picks from the shared card padding scale.
 */
export function Card({
  children,
  className,
  as: Tag = "div",
  variant = "plain",
  padding = "normal",
  role,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  variant?: Variant;
  padding?: Padding;
  role?: string;
}) {
  return (
    <Tag
      role={role}
      className={cn(
        "rounded-card",
        PADDINGS[padding],
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
