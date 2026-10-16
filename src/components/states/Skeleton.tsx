import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Peach shimmer placeholder. Decorative — always `aria-hidden`; wrap groups in
 * `SkeletonScreen` (or a `role="status"` container) so screen readers announce
 * loading once instead of reading each block.
 */
function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("shimmer block rounded-sm", className)} />;
}

/** Card-sized block matching MSB card radius. */
export function SkeletonCard({ className }: { className?: string }) {
  return <Skeleton className={cn("h-24 rounded-card", className)} />;
}

/** List-row sized block. */
export function SkeletonRow({ className }: { className?: string }) {
  return <Skeleton className={cn("h-12 rounded-row", className)} />;
}

/**
 * Accessible wrapper for a loading layout: announces "Đang tải…" politely while
 * the shimmer blocks (aria-hidden) stand in for stable-layout content.
 */
export function SkeletonScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-4", className)}>
      <span className="sr-only">Đang tải…</span>
      {children}
    </div>
  );
}
