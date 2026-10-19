"use client";

import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { Panel, Toggle } from "../../settings-ui";
import { getClock, onEngineChange, putClock } from "./sim";

/** UC10: skip the hold wait so a tester can send without waiting 15 minutes. */
export function HoldSkipPanel() {
  const { persona } = usePersona();
  const [skip, setSkip] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = () => { void getClock(persona.cif).then(clock => setSkip(clock.skipHold)).catch(() => {}); };
    load();
    return onEngineChange(load);
  }, [persona.cif]);

  const toggle = () => {
    const next = !skip;
    setSkip(next);
    void putClock(persona.cif, { skipHold: next }).then(clock => {
      setSkip(clock.skipHold);
      setStatus(clock.skipHold ? "Đã bỏ qua thời gian giữ. Lệnh đang giữ được chuyển ngay." : "Giữ lệnh trở lại 15 phút.");
    }).catch(() => {
      setSkip(!next);
      setStatus("Không đặt được thời gian giữ.");
    });
  };

  return <Panel title="Giữ lệnh">
    <div className="settings-row">
      <span className="flex-1">
        <strong>Bỏ qua thời gian giữ</strong>
        <span className="mt-1 block text-sm text-muted">Bật thì lệnh mới không phải chờ, và lệnh đang giữ được thả ngay.</span>
      </span>
      <Toggle label="Bỏ qua thời gian giữ" checked={skip} onChange={toggle} />
    </div>
    {status && <p className="pb-4 text-sm text-muted" role="status">{status}</p>}
  </Panel>;
}
