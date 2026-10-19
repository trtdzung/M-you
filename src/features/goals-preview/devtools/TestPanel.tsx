"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FlaskConical } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { canvasZoom } from "@/lib/motion";
import { usePreview } from "../store/PreviewStore";
import { selectGoal, selectTopGoal } from "../store/selectors";
import { DeviceOverlay } from "../ui/shared/DeviceOverlay";
import { ring } from "../ui/shared/styles";
import { AgentTab } from "./tabs/AgentTab";
import { DataTab } from "./tabs/DataTab";
import { EventTab } from "./tabs/EventTab";
import { ScenarioTab } from "./tabs/ScenarioTab";
import { TimeTab } from "./tabs/TimeTab";
import { toolInput } from "./tabs/kit";

const TABS = [
  { id: "scenario", label: "Kịch bản" },
  { id: "time", label: "Thời gian" },
  { id: "event", label: "Sự kiện" },
  { id: "agent", label: "Gợi ý" },
  { id: "data", label: "Dữ liệu" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const BUTTON_SIZE = 44;
const DRAG_THRESHOLD = 5;

/**
 * Công cụ test: floating draggable button + bottom sheet with 5 tabs. Not part of
 * the customer UI; portalled into the phone frame (position fixed breaks under
 * the desktop zoom).
 */
export function TestPanel() {
  const { state } = usePreview();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("scenario");
  const [goalPick, setGoalPick] = useState<string>("");

  const close = useCallback(() => setOpen(false), []);

  // Goal shared by every tab: explicit pick, else top priority goal, else first goal.
  const goal = selectGoal(state, goalPick) ?? selectTopGoal(state) ?? state.goals[0];

  // ---- drag
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    const canvas = document.getElementById("device-canvas");
    if (!canvas || e.button !== 0) return;
    const zoom = canvasZoom();
    const rect = canvas.getBoundingClientRect();
    const btn = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: (btn.left - rect.left) / zoom,
      originY: (btn.top - rect.top) / zoom,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore: move/up still arrive
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    const canvas = document.getElementById("device-canvas");
    if (!d || d.id !== e.pointerId || !canvas) return;
    const zoom = canvasZoom();
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPos({
      x: Math.min(Math.max(0, d.originX + dx), canvas.offsetWidth - BUTTON_SIZE),
      y: Math.min(Math.max(0, d.originY + dy), canvas.offsetHeight - BUTTON_SIZE),
    });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved) setOpen(true);
  }

  return (
    <>
      <DeviceOverlay>
        <button
          type="button"
          aria-label="Mở công cụ test (chỉ dành cho team)"
          title="Công cụ test: kéo để di chuyển"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (dragRef.current = null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          style={{ ...(pos ? { left: pos.x, top: pos.y } : {}), width: BUTTON_SIZE, height: BUTTON_SIZE }}
          className={cn(
            "absolute z-30 flex touch-none select-none flex-col items-center justify-center rounded-full bg-ink-soft/85 text-white shadow-nav",
            !pos && "right-2 top-[58%]",
            ring,
          )}
        >
          <FlaskConical size={17} aria-hidden />
          <span className="text-[9px] font-bold uppercase leading-3 tracking-wide">Test</span>
        </button>
      </DeviceOverlay>

      <Sheet
        open={open}
        onClose={close}
        title="Công cụ test"
        description="Chỉ dành cho team thử nghiệm, không phải giao diện khách hàng."
      >
        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label="Công cụ test" className="grid grid-cols-5 gap-1 rounded-xl bg-surface-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "min-h-11 rounded-lg px-1 text-[12px] font-semibold leading-4",
                  ring,
                  tab === t.id ? "bg-surface text-text shadow-card" : "text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-muted">Mục tiêu đang chọn (cho các thao tác bên dưới)</span>
            <select
              value={goal?.id ?? ""}
              onChange={(e) => setGoalPick(e.target.value)}
              disabled={state.goals.length === 0}
              className={toolInput}
            >
              {state.goals.length === 0 && <option value="">Chưa có mục tiêu</option>}
              {state.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id})
                </option>
              ))}
            </select>
          </label>

          <div role="tabpanel">
            {tab === "scenario" && <ScenarioTab goalId={goal?.id} close={close} />}
            {tab === "time" && <TimeTab goal={goal} />}
            {tab === "event" && <EventTab goal={goal} />}
            {tab === "agent" && <AgentTab goal={goal} close={close} />}
            {tab === "data" && <DataTab close={close} />}
          </div>
        </div>
      </Sheet>
    </>
  );
}
