"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Transaction } from "@/domain/models";
import { wrappedCoverage, wrappedEndMonthKey } from "@/domain/wrapped";
import { currentMonthKey } from "@/lib/demo-clock";
import { WRAPPED_ENABLED } from "@/lib/wrapped-flag";
import { WRAPPED_ENTRY } from "./wrapped-ui-copy";

/**
 * Tổng quan entry to the Wrapped story. It shows availability only — no numbers —
 * and only when the window has enough spending data (`wrappedCoverage`, the same
 * pure rule that gates the deck) and the feature flag is on. It receives the
 * already-composed `transactions` and never calls `useFinancials`/`useWrapped`
 * itself, so the screen pays for no second computation.
 * Look: an MSB banner (`.brand-gradient`) carrying only the white logo, the large
 * title (20px bold) and a white pill (`primary-strong` text, 5.18:1); the teaser sits
 * on the white body in `text-muted`. White on the gradient's dark stop is 4.49:1, so
 * no normal-size text goes there. The whole card is one link; logo and pill are
 * decorative, the link text is title + teaser.
 */
export function WrappedEntryCard({ transactions }: { transactions: Transaction[] }) {
  const sufficient = useMemo(
    () => WRAPPED_ENABLED && wrappedCoverage(transactions, wrappedEndMonthKey(currentMonthKey())).sufficient,
    [transactions],
  );
  if (!sufficient) return null;

  return (
    <Link
      href="/wrapped"
      data-testid="wrapped-entry-card"
      className="group flex flex-col overflow-hidden rounded-card bg-surface shadow-card transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <span className="brand-gradient flex items-center gap-3 px-5 py-4 text-white">
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, same pattern as HomeHeader */}
          <img src="/brand/msb-logo-white.png" alt="" aria-hidden className="h-6 w-auto self-start" />
          <span className="text-xl font-bold leading-snug">{WRAPPED_ENTRY.title}</span>
        </span>
        <span
          aria-hidden
          className="flex min-h-9 shrink-0 items-center gap-0.5 rounded-pill bg-white px-4 text-sm font-bold text-primary-strong transition-transform group-hover:translate-x-0.5"
        >
          {WRAPPED_ENTRY.cta}
          <ChevronRight size={16} />
        </span>
      </span>
      <span className="px-5 py-3 text-sm leading-snug text-muted">{WRAPPED_ENTRY.body}</span>
    </Link>
  );
}
