"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { Action, Panel } from "../../settings-ui";
import { resetTestState } from "./actions";

/** Puts Scam Shield and the simulated alert hour back to defaults, after one confirm. */
export function ResetPanel() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    void resetTestState().then(() => {
      setConfirming(false);
      setDone(true);
    }).catch(() => setConfirming(false));
  };

  return <Panel title="Đặt lại">
    <div className="py-4">
      <Action onClick={() => { setDone(false); setConfirming(true); }}>Đặt lại Scam Shield về mặc định</Action>
      {done && <p className="mt-3 text-sm leading-relaxed text-muted" role="status">Đã xóa dữ liệu engine của persona và đưa Scam Shield về mặc định.</p>}
    </div>
    <Sheet open={confirming} title="Đặt lại Scam Shield?" onClose={() => setConfirming(false)}>
      <p className="mb-5 text-sm leading-relaxed">Mọi cài đặt Scam Shield và dữ liệu engine của persona này (sự kiện, đồng hồ, tần suất, giữ lệnh) sẽ về mặc định.</p>
      <Action onClick={reset}>Đặt lại</Action>
    </Sheet>
  </Panel>;
}
