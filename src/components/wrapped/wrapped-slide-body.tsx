import type { ReactNode } from "react";
import Link from "next/link";
import { SourceBadge, sourceBadgeVisible, type Source } from "@/components/primitives/SourceBadge";
import type { WrappedCopyLine } from "@/domain/wrapped";
import { WrappedSurfaceCard } from "./wrapped-surface-card";

/** Budget tab: where the closing CTA lands (the human sets the limits there). */
const CLOSING_HREF = "/pfm?tab=budget";

/** Shared stack spacing (steps down on short screens). */
export const STACK = "flex flex-col gap-4 [@media(max-height:700px)]:gap-3";

/** Keep an amount and its dong sign on one line ("73,847,000 VND" must not wrap before "VND"). */
export const keepCurrency = (text: string): string => text.replace(/ VND/g, " VND");

/** The frame's body lines (already filtered by `SLIDE_LAYOUT`). Not `aria-hidden` itself: the caller's wrapper is. */
export function WrappedSlideLines({ lines }: { lines: readonly WrappedCopyLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => (
        <p
          // copy lines are positional; order is their identity
          key={i}
          className="text-base font-medium leading-snug"
        >
          {keepCurrency(line.text)}
        </p>
      ))}
    </div>
  );
}

/**
 * Assumption footnote + provenance badge, `aria-hidden` (the live region reads `copy.srText`).
 * Renders nothing when neither would show (the badge is off app-wide, see `sourceBadgeVisible`).
 */
export function WrappedSlideFootnote({ footnote, source }: { footnote?: string; source: Source | null }) {
  const badge = sourceBadgeVisible(source);
  if (!footnote && !badge) return null;
  return (
    <div aria-hidden className={STACK}>
      {footnote && <p className="text-xs leading-relaxed">{keepCurrency(footnote)}</p>}
      {badge && <SourceBadge source={source} className="self-start" />}
    </div>
  );
}

/**
 * Closing CTA: a `primary-strong` pill with white text (5.18:1). It only navigates to
 * the budget tab — the human sets limits there; nothing is committed from here.
 */
export function WrappedSlideCta({ cta }: { cta?: string }) {
  if (!cta) return null;
  return (
    <Link
      href={CLOSING_HREF}
      className="pointer-events-auto inline-flex min-h-12 items-center justify-center self-start rounded-pill bg-primary-strong px-6 text-base font-bold text-primary-fg shadow-nav transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-2"
    >
      {cta}
    </Link>
  );
}

/**
 * Brand-slide body: everything below large size sits in ONE white surface (normal
 * text never touches the gradient). Order inside: visual, body lines, footnote/badge,
 * CTA. The `aria-hidden` split is kept: the CTA is a sibling of the hidden blocks.
 * Renders nothing when there is nothing to show (never an empty card).
 */
export function WrappedBrandCard({
  visual = null,
  lines = [],
  footnote,
  source = null,
  cta,
}: {
  visual?: ReactNode;
  lines?: readonly WrappedCopyLine[];
  footnote?: string;
  source?: Source | null;
  cta?: string;
}) {
  const head = Boolean(visual) || lines.length > 0;
  // A hidden badge is not content: counting it would leave an empty white card.
  if (!head && !footnote && !sourceBadgeVisible(source) && !cta) return null;
  return (
    <WrappedSurfaceCard>
      {head && (
        <div aria-hidden className={STACK}>
          {visual}
          <WrappedSlideLines lines={lines} />
        </div>
      )}
      <WrappedSlideFootnote footnote={footnote} source={source} />
      <WrappedSlideCta cta={cta} />
    </WrappedSurfaceCard>
  );
}
