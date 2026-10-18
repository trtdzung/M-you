"use client";

import { useShallow } from "zustand/react/shallow";
import { useSecurityStore } from "@/state/security/store";
import { Action, Panel } from "../../settings-ui";
import { applyAllPending, pendingCount } from "./actions";

/** Applies every request still waiting out the 24h delay, right now. */
export function SkipWaitPanel() {
  const count = pendingCount(useSecurityStore(useShallow(state => ({ pendingOff: state.pendingOff, emergencyContacts: state.emergencyContacts }))));

  return <Panel title="Bỏ qua thời gian chờ">
    <div className="py-4">
      <Action disabled={count === 0} onClick={applyAllPending}>Áp dụng ngay mọi yêu cầu đang chờ 24 giờ</Action>
      <p className="mt-3 text-sm text-muted">{count === 0 ? "Không có yêu cầu nào đang chờ." : `${count} yêu cầu đang chờ.`}</p>
    </div>
  </Panel>;
}
