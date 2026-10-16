"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Client-only chart container. Recharts needs a measured width, so we render a
 * fixed-height placeholder during SSR/first paint and mount the chart after.
 * Also provides a horizontal-scroll guard for narrow phones.
 */
export function ChartFrame({
  height = 200,
  children,
  label,
}: {
  height?: number;
  children: ReactNode;
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      {mounted ? children : <div className="h-full w-full animate-pulse rounded-md bg-surface-muted" />}
    </div>
  );
}
