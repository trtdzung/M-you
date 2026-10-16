"use client";

/**
 * App entry gate. The app opens directly on the home screen — there is no forced
 * onboarding/consent flow. For the demo we silently grant the (demo-data) consent
 * record on first mount if it is missing, so the "Quyền dữ liệu" view in Cài đặt
 * still reflects granted scopes and the revoke affordance (PFM-094) keeps working.
 * Runs after mount because consent lives in localStorage.
 */

import { useEffect, useState } from "react";
import { hasValidConsent, setConsent } from "@/lib/consent";

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasValidConsent()) setConsent();
    setReady(true);
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
