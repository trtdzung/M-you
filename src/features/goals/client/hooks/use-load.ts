"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type { FetchResult } from "../http";

export interface LoadState<T> {
  data: T | null;
  loading: boolean;
  /** Server message of a failed load ("" when it gave none); null when not failed. */
  error: string | null;
  /** HTTP status of a failed load (404 = not found); null otherwise. */
  status: number | null;
  refresh: () => void;
}

/**
 * Loads data for the current persona. A cif (or `scope`) change drops the old
 * data immediately — results are keyed, so a stale response never shows.
 */
export function useLoad<T>(
  scope: string,
  load: (cif: string) => Promise<FetchResult<T>>,
): LoadState<T> {
  const cif = usePersonaCif();
  const key = `${cif ?? ""}|${scope}`;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ key: string; result: FetchResult<T> } | null>(null);

  useEffect(() => {
    if (!cif) return;
    let cancelled = false;
    load(cif).then((result) => {
      if (!cancelled) setState({ key, result });
    });
    return () => {
      cancelled = true;
    };
    // `load` is a fresh closure each render; the key + tick fully describe a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const current = state && state.key === key ? state.result : null;
  return {
    data: current?.ok ? current.data : null,
    loading: cif !== null && current === null,
    error: current && !current.ok ? (current.error ?? "") : null,
    status: current && !current.ok ? current.status : null,
    refresh,
  };
}
