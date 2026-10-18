"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { SECURITY_DEFAULTS } from "@/state/security/defaults";
import { useSecurityStore } from "@/state/security/store";
import { Action, Panel, Row } from "../../settings-ui";

type LogAction = "demo" | "clear";
const COPY: Record<LogAction, { button: string; question: string; done: string }> = {
  demo: { button: "Về dữ liệu demo", question: "Thay nhật ký cảnh báo bằng 3 dòng demo ban đầu?", done: "Đã đưa nhật ký về dữ liệu demo." },
  clear: { button: "Xóa hết", question: "Xóa mọi dòng trong nhật ký cảnh báo?", done: "Đã xóa hết nhật ký cảnh báo." },
};

/** Resets or clears the alert log, after one confirm. */
export function AlertLogPanel() {
  const count = useSecurityStore(state => state.alertLog.length);
  const [pending, setPending] = useState<LogAction | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = (action: LogAction) => {
    useSecurityStore.setState({ alertLog: action === "demo" ? SECURITY_DEFAULTS.alertLog : [] });
    setPending(null);
    setDone(COPY[action].done);
  };

  return <Panel title="Nhật ký cảnh báo">
    <Row label="Xem nhật ký cảnh báo" icon={History} href="/settings/alert-log" detail={`${count} dòng`} />
    <div className="flex flex-col gap-2 py-4">
      {(Object.keys(COPY) as LogAction[]).map(action => <Action key={action} onClick={() => { setDone(null); setPending(action); }}>{COPY[action].button}</Action>)}
      {done && <p className="text-sm text-muted" role="status">{done}</p>}
    </div>
    <Sheet open={pending !== null} title="Nhật ký cảnh báo" onClose={() => setPending(null)}>
      {pending && <>
        <p className="mb-5 text-sm leading-relaxed">{COPY[pending].question}</p>
        <Action onClick={() => run(pending)}>{COPY[pending].button}</Action>
      </>}
    </Sheet>
  </Panel>;
}
