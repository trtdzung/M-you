"use client";

import { SlidersHorizontal } from "lucide-react";
import { DeviceOverlay } from "../ui/shared/DeviceOverlay";
import { ring } from "../ui/shared/styles";
import { usePreview } from "../store/PreviewStore";

/**
 * Floating test panel for the team — stub (T6 builds the panel: scenario picker,
 * jump to screen, advance time, fund price ±%, trigger events, reset).
 * For now the button just returns to the flow map.
 */
export function TestPanel() {
  const { nav } = usePreview();
  return (
    <DeviceOverlay>
      <button
        type="button"
        aria-label="Bảng thử nghiệm (mô phỏng)"
        title="Bảng thử nghiệm"
        onClick={() => nav.reset("FlowMap")}
        className={`absolute bottom-[calc(20px+var(--safe-area-bottom,0px))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-ink-soft text-white shadow-nav ${ring}`}
      >
        <SlidersHorizontal size={20} aria-hidden />
      </button>
    </DeviceOverlay>
  );
}
