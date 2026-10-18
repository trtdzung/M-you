"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { useSecurityStore } from "@/state/security/store";
import { useTestToolsStore } from "@/state/security/test-tools";
import { Action, Panel } from "../../settings-ui";

/** Puts Scam Shield and the simulated alert hour back to defaults, after one confirm. */
export function ResetPanel() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    useSecurityStore.getState().reset();
    useTestToolsStore.getState().setAlertHour(null);
    setConfirming(false);
    setDone(true);
  };

  return <Panel title="Đặt lại">
    <div className="py-4">
      <Action onClick={() => { setDone(false); setConfirming(true); }}>Đặt lại Scam Shield về mặc định</Action>
      {done && <p className="mt-3 text-sm leading-relaxed text-muted" role="status">Đã đặt lại về mặc định (45/100 nếu chưa đổi phần Xác thực).</p>}
    </div>
    <Sheet open={confirming} title="Đặt lại Scam Shield?" onClose={() => setConfirming(false)}>
      <p className="mb-5 text-sm leading-relaxed">Mọi cài đặt Scam Shield của persona này và giờ chấm cảnh báo giả lập sẽ về mặc định.</p>
      <Action onClick={reset}>Đặt lại</Action>
    </Sheet>
  </Panel>;
}
