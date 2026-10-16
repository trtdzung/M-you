import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "plain" | "tint" | "hero";

const VARIANTS: Record<Variant, string> = {
  plain: "bg-surface text-text shadow-card",
  tint: "bg-surface-tint text-text shadow-card",
  hero: "brand-gradient text-primary-fg shadow-card",
};

/**
 * Rounded surface container — MSB style: borderless, rất tròn, soft shadow.
 * `variant`: plain (trắng) · tint (peach) · hero (gradient thương hiệu).
 */
export function Card({
  children,
  className,
  as: Tag = "div",
  variant = "plain",
  role,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  variant?: Variant;
  role?: string;
}) {
  return (
    <Tag
      role={role}
      className={cn(
        "rounded-[24px] p-5",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
