"use client";

import { FlaskConical } from "lucide-react";
import { getScenario } from "../../data/scenarios";
import { formatISODate } from "../../engine/dates";
import { usePreviewState } from "../../store/PreviewStore";

/** Thin strip on top of every screen: this is a simulation. */
export function PreviewBanner() {
  const state = usePreviewState();
  const scenario = getScenario(state.scenarioId);
  return (
    <div
      role="note"
      className="mt-1 flex items-center gap-2 rounded-full bg-source-mock-soft px-3 py-1.5 text-[12px] leading-4 text-source-mock"
    >
      <FlaskConical size={14} aria-hidden className="shrink-0" />
      <span className="font-semibold">Bản xem trước – dữ liệu mô phỏng</span>
      <span aria-hidden>·</span>
      <span className="min-w-0 truncate" title={scenario.title}>
        KB {scenario.code}
      </span>
      <span className="ml-auto shrink-0 tabular-nums" title="Ngày mô phỏng">
        {formatISODate(state.clock.today)}
      </span>
    </div>
  );
}
