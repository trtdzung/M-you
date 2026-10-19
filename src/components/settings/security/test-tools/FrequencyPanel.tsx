"use client";

import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { SCENARIO_COPY, type ScenarioId } from "@/lib/security/scenario-copy";
import { Action, Panel } from "../../settings-ui";
import { deleteMark, loadMarks, onEngineChange, type FrequencyMark } from "./sim";

const when = (ms: number) => new Date(ms).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

function label(mark: FrequencyMark): string {
  const copy = SCENARIO_COPY[mark.scenario as ScenarioId];
  const rule = copy ? copy.frequency : mark.scenario;
  return `${mark.scenario} · ${rule}${mark.key ? ` · ${mark.key}` : ""}`;
}

/** Marks the frequency rules already count, with a way to forget one or all. */
export function FrequencyPanel() {
  const { persona } = usePersona();
  const [marks, setMarks] = useState<FrequencyMark[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadMarks(persona.cif).then(rows => { if (active) setMarks(rows); }).catch(() => { if (active) setStatus("Không đọc được tần suất."); });
    };
    refresh();
    const stop = onEngineChange(refresh);
    return () => { active = false; stop(); };
  }, [persona.cif]);

  const remove = async (id: string | "all") => {
    setStatus("");
    try {
      setMarks(await deleteMark(persona.cif, id));
      setStatus(id === "all" ? "Đã xóa hết mốc đã hiện." : "Đã xóa mốc.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không xóa được mốc.");
    }
  };

  return <Panel title="Tần suất đã hiện">
    <div className="py-4">
      {marks.length === 0 && <p className="mb-3 text-sm text-muted">Chưa có mốc nào.</p>}
      {marks.map(mark => <div key={mark.id} className="settings-row items-start">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{label(mark)}</span>
          <span className="mt-1 block text-sm text-muted">{when(mark.at)}</span>
        </span>
        <button type="button" className="shrink-0 text-sm font-semibold text-primary" onClick={() => void remove(mark.id)}>Xóa</button>
      </div>)}
      <Action disabled={marks.length === 0} onClick={() => void remove("all")}>Xóa hết mốc đã hiện</Action>
      {status && <p className="mt-3 text-sm text-muted" role="status">{status}</p>}
    </div>
  </Panel>;
}
