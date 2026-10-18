"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { TEST_PRESETS, type TestPreset } from "@/state/security/test-presets";
import { Action, Panel, Row } from "../../settings-ui";
import { applyPreset } from "./actions";

/** One-tap Scam Shield states for testing. Keeps the current alert log. */
export function PresetPanel() {
  const [chosen, setChosen] = useState<TestPreset | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const apply = (preset: TestPreset) => {
    applyPreset(preset);
    setChosen(null);
    setApplied(preset.label);
  };

  return <Panel title="Đặt nhanh trạng thái">
    {TEST_PRESETS.map(preset => <Row key={preset.id} label={preset.label} detail={preset.description} onClick={() => { setApplied(null); setChosen(preset); }} />)}
    {applied && <p className="py-3 text-sm text-muted" role="status">Đã áp dụng &lsquo;{applied}&rsquo;.</p>}
    <Sheet open={chosen !== null} title="Đặt nhanh trạng thái" onClose={() => setChosen(null)}>
      {chosen && <>
        <p className="mb-5 text-sm leading-relaxed">Thay trạng thái Scam Shield hiện tại bằng &lsquo;{chosen.label}&rsquo;?</p>
        <Action onClick={() => apply(chosen)}>Áp dụng</Action>
      </>}
    </Sheet>
  </Panel>;
}
