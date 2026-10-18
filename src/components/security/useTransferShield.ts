"use client";

// Scam Shield on the confirm screen: asks the engine about the transfer being
// reviewed (debounced) and lets "Xác nhận" wait for the answer. The engine
// failing never blocks a transfer: no answer = no warning.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Intervention } from "@/lib/security/intervention-types";
import type { TransferReview } from "@/lib/security/signal-context";
import { pokeInterventions } from "./useInterventions";

const DEBOUNCE_MS = 400;
const MAX_WAIT_MS = 6_000;

type Shield = { status: "idle" | "loading" | "ready" | "error"; intervention: Intervention | null };

async function evaluateReview(cif: string, review: TransferReview, signal: AbortSignal): Promise<Intervention | null> {
  const res = await fetch("/api/security/evaluate", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ cif, trigger: "transfer_review", review }),
  });
  if (!res.ok) throw new Error(`evaluate ${res.status}`);
  const { interventions } = (await res.json()) as { interventions: Intervention[] };
  return interventions[0] ?? null;
}

/** `review` null = nothing to judge (no valid draft). */
export function useTransferShield(cif: string, review: TransferReview | null) {
  const [shield, setShield] = useState<Shield>({ status: "idle", intervention: null });
  const pending = useRef<Promise<Intervention | null> | null>(null);
  const latest = useRef<Intervention | null>(null);
  const key = review ? JSON.stringify(review) : null;

  useEffect(() => {
    if (!key) {
      latest.current = null;
      pending.current = null;
      setShield({ status: "idle", intervention: null });
      return;
    }
    const controller = new AbortController();
    latest.current = null;
    let poll: number | undefined;
    const refresh = async (id: string) => {
      try {
        const response = await fetch(`/api/security/interventions?cif=${encodeURIComponent(cif)}&target=transfer-confirm`, { signal: controller.signal });
        if (!response.ok) return;
        const { interventions } = await response.json() as { interventions: Intervention[] };
        const item = interventions.find(i => i.id === id);
        if (controller.signal.aborted || latest.current?.id !== id) return;
        if (item) { latest.current = item; setShield({ status: "ready", intervention: item }); }
        if (item?.agentStatus === "pending") poll = window.setTimeout(() => void refresh(id), 750);
      } catch { /* Keep the visible rule on a network failure. */ }
    };
    setShield(current => ({ ...current, status: "loading" }));
    let release: (value: Intervention | null) => void = () => {};
    pending.current = new Promise(resolve => { release = resolve; });
    const timer = window.setTimeout(() => {
      evaluateReview(cif, JSON.parse(key) as TransferReview, controller.signal)
        .then(intervention => {
          if (controller.signal.aborted) return;
          latest.current = intervention;
          setShield({ status: "ready", intervention });
          if (intervention?.agentStatus === "pending") poll = window.setTimeout(() => void refresh(intervention.id), 750);
          release(intervention);
          pokeInterventions();
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setShield({ status: "error", intervention: null });
          release(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(poll);
      controller.abort();
      release(null);
    };
  }, [cif, key]);

  /** The verdict for the current draft, waiting for an evaluation in flight (bounded). */
  const ensure = useCallback(async (): Promise<Intervention | null> => {
    if (latest.current) return latest.current;
    if (!pending.current) return shield.intervention;
    const timeout = new Promise<null>(resolve => window.setTimeout(() => resolve(null), MAX_WAIT_MS));
    return Promise.race([pending.current, timeout]);
  }, [shield.intervention]);

  /** Drop the current verdict locally after the customer answered it. */
  const clear = useCallback(() => { latest.current = null; pending.current = null; setShield({ status: "ready", intervention: null }); }, []);

  return { ...shield, ensure, clear };
}
