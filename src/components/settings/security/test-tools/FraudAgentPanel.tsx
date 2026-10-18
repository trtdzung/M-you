"use client";

import { useEffect, useState } from "react";
import { Panel, Toggle } from "../../settings-ui";

/** Kill switch for the Fraud agent. Off means every screen keeps the spec wording. */
export function FraudAgentPanel() {
  const [enabled, setEnabled] = useState(true);
  const [forced, setForced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/security/fraud-agent", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        const body = await response.json() as { enabled?: boolean; forcedOff?: boolean };
        if (!active) return;
        setEnabled(body.enabled !== false);
        setForced(Boolean(body.forcedOff));
      })
      .catch(() => { if (active) setEnabled(true); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    void fetch("/api/security/fraud-agent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).then(async response => {
      if (!response.ok) return;
      const body = await response.json() as { enabled?: boolean; forcedOff?: boolean };
      setEnabled(body.enabled !== false);
      setForced(Boolean(body.forcedOff));
    }).catch(() => setEnabled(!next));
  };

  return <Panel title="Fraud agent">
    <div className="settings-row">
      <span className="flex-1">
        <strong>Tắt Fraud agent</strong>
        <span className="mt-1 block text-sm text-muted">{forced
          ? "Cấu hình server FRAUD_AGENT_ENABLED đang tắt. Mọi màn dùng câu nguyên văn."
          : "Tắt khi agent bị tấn công hoặc trả lời sai hàng loạt. App quay về chế độ không AI."}</span>
      </span>
      <Toggle label="Tắt Fraud agent" checked={!enabled} disabled={!ready || forced} onChange={toggle} />
    </div>
  </Panel>;
}
