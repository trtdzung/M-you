"use client";

import { useCallback, useEffect, useState } from "react";

const ONBOARDED_KEY = "msb-pfm.onboarded";

/**
 * First-run flag for the PFM setup screen. `JarConfigProvider` always seeds a
 * default template, so config existence can't tell first-run from a returning
 * user — this separate localStorage flag does. `ready` stays false until the
 * flag is read on the client (avoids a hydration flash of the wrong screen);
 * gate the setup UI on `ready` so nothing renders until the answer is known.
 */
export function useOnboarded() {
  const [onboarded, setOnboarded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setOnboarded(window.localStorage.getItem(ONBOARDED_KEY) === "1");
    } catch {
      setOnboarded(false);
    }
    setReady(true);
  }, []);

  const complete = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* private mode / storage disabled — flag stays in memory for this session */
    }
    setOnboarded(true);
  }, []);

  return { onboarded, ready, complete };
}
