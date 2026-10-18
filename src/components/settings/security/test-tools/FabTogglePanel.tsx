"use client";

import { useTestToolsFabStore } from "@/state/security/test-tools";
import { Panel, Toggle } from "../../settings-ui";

/** Switches the floating quick-action button on or off (saved in this browser). */
export function FabTogglePanel() {
  const showFab = useTestToolsFabStore(state => state.showFab);
  const setShowFab = useTestToolsFabStore(state => state.setShowFab);

  return <Panel title="Nút nổi">
    <div className="settings-row">
      <span className="flex-1"><strong>Hiện nút thao tác nhanh</strong><span className="mt-1 block text-sm text-muted">Nút tròn trên mọi màn: bấm để đổi giờ chấm, preset, bỏ qua chờ ngay tại chỗ; kéo để di chuyển. Lưu trên trình duyệt này.</span></span>
      <Toggle label="Hiện nút thao tác nhanh" checked={showFab} onChange={() => setShowFab(!showFab)} />
    </div>
  </Panel>;
}
