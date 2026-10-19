"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ErrorState, InsufficientData, SkeletonCard, SkeletonScreen } from "@/components/states";
import type { WrappedDeck } from "@/domain/wrapped";
import { usePersona } from "@/providers/context";
import { useWrapped } from "@/state/useWrapped";
import { WrappedStoryViewer } from "./WrappedStoryViewer";
import { deckHash } from "./wrapped-deck-hash";
import {
  insufficientDescription,
  WRAPPED_BACK,
  WRAPPED_CONSENT,
  WRAPPED_ERROR,
  WRAPPED_INSUFFICIENT_TITLE,
  WRAPPED_LOADING,
} from "./wrapped-ui-copy";

const FALLBACK_HREF = "/pfm";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-pill bg-primary-strong px-5 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

/** Non-story states share one calm frame with a way back (the route has no PFM header). */
function StateFrame({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-4 px-4 pb-6 pt-2">
      <button
        type="button"
        onClick={onBack}
        aria-label={WRAPPED_BACK}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={22} strokeWidth={2} aria-hidden />
      </button>
      <div className="flex flex-1 flex-col justify-center gap-4">{children}</div>
    </div>
  );
}

/**
 * `/wrapped` screen: resolves `useWrapped()` into loading / error / consent /
 * insufficient / ready. The ready deck is FROZEN the moment it first becomes ready
 * and stays frozen until the screen leaves `ready` (retry, persona switch, consent
 * change) — a background recompute (e.g. auto-categorize landing) must not swap
 * slides under a user mid-story. The viewer is keyed by persona + deck hash.
 */
export function WrappedScreen() {
  const router = useRouter();
  const { personaId } = usePersona();
  const { status, deck, coverage, retry } = useWrapped();
  const [frozen, setFrozen] = useState<{ personaId: string; deck: WrappedDeck } | null>(null);

  // Derived-state adjustment during render (React-sanctioned): freeze on entering
  // `ready`, drop on leaving it or on a persona change.
  const live = status === "ready" && deck ? { personaId, deck } : null;
  if (live === null && frozen !== null) setFrozen(null);
  else if (live !== null && (frozen === null || frozen.personaId !== live.personaId)) setFrozen(live);

  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(FALLBACK_HREF);
  }, [router]);

  const shown = status === "ready" ? (frozen ?? live) : null;
  if (shown) {
    return (
      <WrappedStoryViewer key={`${shown.personaId}:${deckHash(shown.deck)}`} deck={shown.deck} onClose={close} />
    );
  }

  return (
    <StateFrame onBack={close}>
      {status === "loading" && (
        <SkeletonScreen>
          <p className="text-center text-sm font-medium text-muted">{WRAPPED_LOADING}</p>
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-24" />
        </SkeletonScreen>
      )}
      {status === "error" && (
        <ErrorState
          title={WRAPPED_ERROR.title}
          description={WRAPPED_ERROR.description}
          action={
            <button type="button" onClick={retry} className={BUTTON}>
              {WRAPPED_ERROR.retry}
            </button>
          }
        />
      )}
      {status === "consent" && (
        <InsufficientData
          title={WRAPPED_CONSENT.title}
          description={WRAPPED_CONSENT.description}
          action={
            <Link href="/consent" className={BUTTON}>
              {WRAPPED_CONSENT.cta}
            </Link>
          }
        />
      )}
      {status === "insufficient" && (
        <InsufficientData title={WRAPPED_INSUFFICIENT_TITLE} description={insufficientDescription(coverage)} />
      )}
    </StateFrame>
  );
}
