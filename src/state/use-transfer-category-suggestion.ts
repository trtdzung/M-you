"use client";

/**
 * Suggest a SPENDING CATEGORY for a single self-reported transfer (invariant
 * #6-safe): the returned suggestion is ALWAYS pending — this hook never mutates
 * the record and never moves a number. Only the user accepting it (in
 * TransferCategorizeSection) flips the txn transfer→expense and routes the spend
 * into the owning jar, exactly like a manual category pick.
 *
 * A transfer is NOT automatically a spend, so nothing is auto-applied here — the
 * user stays the one who decides "this transfer was really a purchase" by tapping
 * Accept (or ignores the guess and leaves it a transfer).
 *
 * Consent (Red Team #2, #9):
 *  - With the "ai" scope granted, the recipient name + memo go to the server-side
 *    LLM (GreenNode) via the same-origin proxy (mode "spending"), tagged
 *    origin:"ai". On any error/offline it degrades to the LOCAL heuristic.
 *  - WITHOUT "ai" it runs ONLY the local heuristic — no text leaves the device.
 *    (The heuristic is deterministic keyword matching, honestly origin:"heuristic";
 *    a recipient's personal name rarely matches a rule, so most transfers get no
 *    guess — honest, never a fabricated category.)
 *
 * Every suggested id is validated against the persona's ASSIGNABLE expense set
 * before it is surfaced — the model is untrusted (invariant #7), and a category
 * outside the persona's taxonomy is dropped rather than shown.
 */

import { useEffect, useState } from "react";
import { getConsent, hasScope, CONSENT_CHANGED_EVENT } from "@/lib/consent";
import { usePersona } from "@/providers/context";
import { createRemoteClassify } from "@/ai/categorize/remote-classifier";
import { createLocalClassify } from "@/ai/categorize/local-classifier";
import { CATEGORIZE_CONFIDENCE_THRESHOLD } from "@/ai/categorize/config";
import type { ClassifyInput, ClassifyFn, ClassifyOrigin } from "@/ai/categorize/types";

export interface TransferCategorySuggestion {
  categoryId: string;
  origin: ClassifyOrigin;
}

/**
 * First result whose id is a real, assignable expense category for this persona
 * AND whose confidence clears `minConfidence`, or undefined. The UNCLASSIFIED/
 * transfer sentinel can never satisfy `has` on the assignable set (it holds
 * expense ids only), so a "leave it a transfer" answer simply yields no
 * suggestion — we never surface a non-category as a guess.
 *
 * The gate matters for the AI path: the "spending" prompt forbids omitting, so
 * the model returns SOME category for every transfer (a personal-name recipient
 * is a near-blind guess with low confidence). Gating at the confidence threshold
 * suppresses those blind guesses so we only ever nudge the user when the model is
 * actually sure — no noisy "Mua sắm" on every transfer.
 */
async function firstCategory(
  classify: ClassifyFn,
  input: ClassifyInput,
  assignableIds: ReadonlySet<string>,
  minConfidence: number,
): Promise<string | undefined> {
  const rows = await classify([input]);
  const hit = rows.find(
    (r) => r.txnId === input.txnId && assignableIds.has(r.categoryId) && r.confidence >= minConfidence,
  );
  return hit?.categoryId;
}

export function useTransferCategorySuggestion(args: {
  txnId: string;
  recipientName: string;
  note?: string;
  amount: number;
  /** The persona's assignable expense ids — the whitelist every guess is validated against. */
  assignableIds: ReadonlySet<string>;
  /** Only suggest while the transfer is still unclassified (no category yet). */
  enabled: boolean;
}): { suggestion: TransferCategorySuggestion | null; loading: boolean } {
  const { txnId, recipientName, note, amount, assignableIds, enabled } = args;
  const { persona } = usePersona();

  // Reactive "ai" consent (mirrors auto-categorize.tsx: same-tab custom event +
  // cross-tab storage; the native storage event never fires in the writing tab).
  const [aiConsent, setAiConsent] = useState(false);
  useEffect(() => {
    const read = () => setAiConsent(hasScope(getConsent(), "ai"));
    read();
    window.addEventListener("storage", read);
    window.addEventListener(CONSENT_CHANGED_EVENT, read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener(CONSENT_CHANGED_EVENT, read);
    };
  }, [persona.cif]);

  const [suggestion, setSuggestion] = useState<TransferCategorySuggestion | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    const input: ClassifyInput = {
      txnId,
      merchant: recipientName,
      amount,
      direction: "debit",
      type: "transfer",
      ...(note ? { note } : {}),
    };

    (async () => {
      setLoading(true);
      // AI first (if consented); fall back to the local heuristic on any failure.
      if (aiConsent) {
        try {
          const id = await firstCategory(
            createRemoteClassify(persona.cif),
            input,
            assignableIds,
            // Only nudge when the model is confident — a blind guess for a
            // personal-name recipient falls through to the (silent) heuristic.
            CATEGORIZE_CONFIDENCE_THRESHOLD,
          );
          if (cancelled) return;
          if (id) {
            setSuggestion({ categoryId: id, origin: "ai" });
            setLoading(false);
            return;
          }
        } catch {
          // offline / upstream error → degrade to heuristic below
        }
      }
      try {
        // The heuristic already self-limits to strong keyword matches, so it is
        // surfaced ungated (a match IS the signal); an unknown recipient yields
        // nothing — honest silence, never a fabricated category.
        const id = await firstCategory(createLocalClassify(assignableIds), input, assignableIds, 0);
        if (cancelled) return;
        setSuggestion(id ? { categoryId: id, origin: "heuristic" } : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, txnId, recipientName, note, amount, aiConsent, assignableIds, persona.cif]);

  return { suggestion, loading };
}
