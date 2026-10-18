"use client";

import { useCallback, useState } from "react";
import type { FetchResult } from "../http";

/** Field name -> message; `_form` holds a failure not tied to a field ("" = no server message, UI shows its default). */
export type ActionErrors = Record<string, string>;

/** Runs one write at a time, tracking pending state and the last errors. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<ActionErrors | null>(null);

  const run = useCallback(async <T,>(call: () => Promise<FetchResult<T>>) => {
    setPending(true);
    setErrors(null);
    const res = await call();
    setPending(false);
    if (!res.ok) setErrors(res.errors ?? { _form: res.error ?? "" });
    return res;
  }, []);

  const reset = useCallback(() => setErrors(null), []);
  return { run, pending, errors, reset };
}
