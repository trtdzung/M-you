"use client";

/**
 * Suggest the PURPOSE of a single self-reported transfer (invariant #6-safe):
 * the returned suggestion is ALWAYS pending — this hook never mutates the record
 * and never moves a number. Only the user accepting a `spending` purpose (in
 * TransferCategorizeSection) flips the txn to expense and touches a jar.
 *
 * Consent (Red Team #2, #9):
 *  - With the "ai" scope granted, the recipient name + memo go to the server-side
 *    LLM (GreenNode) via the same-origin proxy (mode "transfer_purpose"), tagged
 *    origin:"ai". On any error/offline it degrades to the LOCAL heuristic.
 *  - WITHOUT "ai" it runs ONLY the local heuristic — no text leaves the device.
 *    (The heuristic is deterministic keyword matching, honestly origin:"heuristic".)
 *
 * Every suggested id is validated against the purpose taxonomy (`isTransferPurpose`)
 * before it is surfaced — the model is untrusted (invariant #7).
 */

import { useEffect, useState } from "react";
import { getConsent, hasScope, CONSENT_CHANGED_EVENT } from "@/lib/consent";
import { usePersona } from "@/providers/context";
import { createRemoteClassify } from "@/ai/categorize/remote-classifier";
import { localPurposeClassify } from "@/ai/transfer-purpose/local-purpose-classifier";
import { isTransferPurpose } from "@/domain/models";
import type { ClassifyInput, ClassifyFn, ClassifyOrigin } from "@/ai/categorize/types";

export interface TransferPurposeSuggestion {
  purposeId: string;
  origin: ClassifyOrigin;
}

/** First valid purpose row for this txn, or undefined. */
async function firstPurpose(classify: ClassifyFn, input: ClassifyInput): Promise<string | undefined> {
  const rows = await classify([input]);
  const hit = rows.find((r) => r.txnId === input.txnId && isTransferPurpose(r.categoryId));
  return hit?.categoryId;
}

export function useTransferPurposeSuggestion(args: {
  txnId: string;
  recipientName: string;
  note?: string;
  amount: number;
  /** Only suggest while the transfer is still unclassified (no purpose yet). */
  enabled: boolean;
}): { suggestion: TransferPurposeSuggestion | null; loading: boolean } {
  const { txnId, recipientName, note, amount, enabled } = args;
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

  const [suggestion, setSuggestion] = useState<TransferPurposeSuggestion | null>(null);
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
          const id = await firstPurpose(createRemoteClassify(persona.cif, "transfer_purpose"), input);
          if (cancelled) return;
          if (id) {
            setSuggestion({ purposeId: id, origin: "ai" });
            setLoading(false);
            return;
          }
        } catch {
          // offline / upstream error → degrade to heuristic below
        }
      }
      try {
        const id = await firstPurpose(localPurposeClassify, input);
        if (cancelled) return;
        setSuggestion(id ? { purposeId: id, origin: "heuristic" } : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, txnId, recipientName, note, amount, aiConsent, persona.cif]);

  return { suggestion, loading };
}
