"use client";

import { useShallow } from "zustand/react/shallow";
import { useSecurityStore } from "@/state/security/store";
import type { PendingOff } from "../pending";
import { Action, Panel } from "../../settings-ui";

/** Applies every request still waiting out the 24h delay, right now. */
export function SkipWaitPanel() {
  const { pendingOff, emergencyContacts } = useSecurityStore(useShallow(state => ({ pendingOff: state.pendingOff, emergencyContacts: state.emergencyContacts })));
  const removingIds = emergencyContacts.filter(contact => contact.status === "removing").map(contact => contact.id);
  const keys = Object.keys(pendingOff) as (keyof PendingOff)[];
  const count = keys.length + removingIds.length;

  const applyAll = () => {
    const { applyOff, applyRemoveContact } = useSecurityStore.getState();
    keys.forEach(key => applyOff(key));
    removingIds.forEach(id => applyRemoveContact(id));
  };

  return <Panel title="Bỏ qua thời gian chờ">
    <div className="py-4">
      <Action disabled={count === 0} onClick={applyAll}>Áp dụng ngay mọi yêu cầu đang chờ 24 giờ</Action>
      <p className="mt-3 text-sm text-muted">{count === 0 ? "Không có yêu cầu nào đang chờ." : `${count} yêu cầu đang chờ.`}</p>
    </div>
  </Panel>;
}
