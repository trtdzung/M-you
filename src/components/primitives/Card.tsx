import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Rounded surface container used as the base building block for sections. */
export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-border bg-surface p-4 shadow-sm",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
