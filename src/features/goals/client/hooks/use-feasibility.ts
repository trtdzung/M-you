"use client";

import { useEffect, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type {
  FeasibilityInput,
  FeasibilityRequest,
  FeasibilityResponse,
} from "../../model/types";
import { checkFeasibility } from "../goals-api";

const DEBOUNCE_MS = 400;

/**
 * Debounced what-if check. Idle (no call) until both `targetAmount` and
 * `targetDate` are set; results of an older input are never shown.
 */
export function useFeasibility(input: FeasibilityInput) {
  const cif = usePersonaCif();
  const ready = cif !== null && !!input.targetAmount && !!input.targetDate;
  const key = ready ? JSON.stringify([cif, input]) : null;
  const [state, setState] = useState<{ key: string; data: FeasibilityResponse | null } | null>(null);

  useEffect(() => {
    if (!key || !cif) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await checkFeasibility(cif, input as FeasibilityRequest);
      if (!cancelled) setState({ key, data: res.ok ? res.data : null });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` encodes cif + the full input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = key && state?.key === key ? state : null;
  return {
    data: current?.data ?? null,
    loading: key !== null && current === null,
    failed: current !== null && current.data === null,
  };
}
