"use client";

import { useState } from "react";
import { AgentSuggestionCard } from "../../agent-sim/AgentSuggestionCard";
import { SUGGESTION_RULES, firedSuggestions, forceSuggestion } from "../../agent-sim/rules";
import type { AgentSuggestion } from "../../model/state";
import type { Goal } from "../../model/types";
import { usePreview } from "../../store/PreviewStore";
import { ButtonGrid, Note, ToolSection, toolButton, toolButtonPrimary, toolInput } from "./kit";

export function AgentTab({ goal, close }: { goal: Goal | undefined; close: () => void }) {
  const { state, dispatch } = usePreview();
  const [ruleKey, setRuleKey] = useState(SUGGESTION_RULES[0].key);
  const [forced, setForced] = useState<AgentSuggestion | null>(null);

  const fired = firedSuggestions(state);
  const dismissed = state.dismissedSuggestionIds;
  const goalName = (id?: string) => state.goals.find((g) => g.id === id)?.name;

  function restore() {
    dispatch({ type: "hydrate", state: { ...state, dismissedSuggestionIds: [], toasts: [] } });
    dispatch({ type: "toast/push", message: `Đã hiện lại ${dismissed.length} gợi ý đã ẩn.`, tone: "info" });
  }

  function force() {
    const s = forceSuggestion(state, ruleKey, goal?.id);
    setForced(s);
    if (!s) dispatch({ type: "toast/push", message: "Dữ liệu hiện tại không đủ để dựng gợi ý này. Thử kịch bản khác.", tone: "warning" });
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolSection title={`Gợi ý đang kích hoạt (${fired.length})`} hint="Theo luật có sẵn, xếp theo độ khẩn cấp.">
        {fired.length === 0 && <Note>Chưa luật nào kích hoạt với dữ liệu này.</Note>}
        <ul className="flex flex-col gap-1.5">
          {fired.map(({ rule, suggestion }) => {
            const hidden = dismissed.includes(suggestion.id);
            return (
              <li key={suggestion.id} className="rounded-xl border border-border px-3 py-2">
                <p className="text-[13px] font-semibold leading-5 text-text">{suggestion.title}</p>
                <p className="text-[12px] leading-4 text-muted">
                  Luật: {rule.label} ({rule.key}){goalName(suggestion.goalId) ? ` · ${goalName(suggestion.goalId)}` : ""}
                </p>
                <p className="text-[12px] leading-4 text-muted">Điều kiện: {rule.when}</p>
                <p className="text-[12px] font-semibold leading-4 text-muted">{hidden ? "Đã ẩn" : "Đang hiển thị"} · id {suggestion.id}</p>
              </li>
            );
          })}
        </ul>
        <button type="button" className={toolButton} disabled={dismissed.length === 0} onClick={restore}>
          Hiện lại gợi ý đã ẩn ({dismissed.length})
        </button>
      </ToolSection>

      <ToolSection title="Ép hiện một gợi ý" hint="Bỏ qua điều kiện để xem thẻ trông thế nào. Dùng mục tiêu đang chọn.">
        <select aria-label="Loại gợi ý" value={ruleKey} onChange={(e) => setRuleKey(e.target.value)} className={toolInput}>
          {SUGGESTION_RULES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <ButtonGrid>
          <button type="button" className={toolButtonPrimary} onClick={force}>Hiện thử</button>
          <button type="button" className={toolButton} disabled={!forced} onClick={() => setForced(null)}>Xoá thẻ</button>
        </ButtonGrid>
        {forced && (
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button[aria-label='Ẩn gợi ý']") === null && (e.target as HTMLElement).closest("button")) close();
            }}
          >
            <AgentSuggestionCard suggestion={forced} />
          </div>
        )}
      </ToolSection>
    </div>
  );
}
