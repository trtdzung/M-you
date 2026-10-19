"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ring } from "../../ui/shared/styles";

/** Small building blocks shared by the test-panel tabs (compact, 44px targets). */

export const toolButton = `inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-[13px] font-semibold leading-4 text-text transition-colors hover:bg-surface-muted disabled:opacity-40 ${ring}`;
export const toolButtonPrimary = `inline-flex min-h-11 items-center justify-center rounded-xl bg-ink-soft px-3 text-[13px] font-semibold leading-4 text-white disabled:opacity-40 ${ring}`;
export const toolInput = `min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-[14px] text-text ${ring}`;

export function ToolSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">{title}</h3>
        {hint && <p className="text-[12px] leading-4 text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function ButtonGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn("grid gap-2", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>{children}</div>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-surface-muted px-3 py-2 text-[12px] leading-4 text-muted">{children}</p>;
}
