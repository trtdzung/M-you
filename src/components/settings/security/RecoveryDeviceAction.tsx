"use client";

import { useState } from "react";
import { usePersona } from "@/providers/context";
import { useRecovery } from "@/components/security/useRecovery";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";
import { Action, Notice } from "../settings-ui";

export const RECOVERY_LABELS = SCENARIO_COPY.SC4.message.split(": ")[1].split(". ")[0].split(" → ");

/** The existing device management demo records an explicit sign-out action. */
export function RecoveryDeviceAction() {
  const recovery = useRecovery();
  const { persona } = usePersona();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/security/events", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif: persona.cif, type: "devices_signed_out", payload: {} }) });
      setDone(response.ok); setError(!response.ok);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <>
    <Action disabled={busy || done || recovery.steps[1]} onClick={() => void signOut()}>{RECOVERY_LABELS[1]}</Action>
    {error && <Notice>Không thể ghi nhận. Vui lòng thử lại.</Notice>}
    {(done || recovery.steps[1]) && <Notice>{RECOVERY_LABELS[1]} (giả lập)</Notice>}
  </>;
}
