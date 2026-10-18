"use client";

import { useTestToolsStore } from "@/state/security/test-tools";
import { Panel, Toggle } from "../../settings-ui";

/** Switches the floating test-tools shortcut on or off (this tab only). */
export function FabTogglePanel() {
  const showFab = useTestToolsStore(state => state.showFab);
  const setShowFab = useTestToolsStore(state => state.setShowFab);

  return <Panel title="Nút nổi">
    <div className="settings-row">
      <span className="flex-1"><strong>Hiện nút mở Công cụ test</strong><span className="mt-1 block text-sm text-muted">Nút tròn ở mép phải trên mọi màn. Chỉ lưu trong tab này.</span></span>
      <Toggle label="Hiện nút mở Công cụ test" checked={showFab} onChange={() => setShowFab(!showFab)} />
    </div>
  </Panel>;
}
