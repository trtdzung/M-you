"use client";

import { useMemo, useState } from "react";
import { SCENARIOS } from "../../data/scenarios";
import type { ScreenId } from "../../model/screens";
import { usePreview } from "../../store/PreviewStore";
import { SCREEN_REGISTRY } from "../../ui/registry";
import { ring } from "../../ui/shared/styles";
import { resolveJump } from "../screenParams";
import { Note, ToolSection, toolButtonPrimary, toolInput } from "./kit";

const GROUP_LABEL: Record<string, string> = {
  entry: "Điểm vào",
  create: "Tạo mục tiêu",
  list: "Danh sách",
  detail: "Chi tiết & tiền",
  assets: "Tài sản",
  invest: "Đầu tư",
  loan: "Vay",
  lifecycle: "Đến hạn & trả nợ",
};

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
}

export function ScenarioTab({ goalId, close }: { goalId: string | undefined; close: () => void }) {
  const { state, dispatch, nav } = usePreview();
  const [query, setQuery] = useState("");
  const [screen, setScreen] = useState<ScreenId>("GoalDetail");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return SCENARIOS;
    return SCENARIOS.filter((s) => normalize(`${s.code} ${s.title} ${s.description}`).includes(q));
  }, [query]);

  const groups = useMemo(() => {
    const map = new Map<string, [ScreenId, string][]>();
    for (const [id, def] of Object.entries(SCREEN_REGISTRY) as [ScreenId, (typeof SCREEN_REGISTRY)[ScreenId]][]) {
      const list = map.get(def.group) ?? [];
      list.push([id, def.title]);
      map.set(def.group, list);
    }
    return [...map.entries()];
  }, []);

  const jump = resolveJump(state, screen, goalId);

  return (
    <div className="flex flex-col gap-4">
      <ToolSection title="Nhảy tới màn" hint="Dùng dữ liệu hiện tại và mục tiêu đang chọn ở trên.">
        <select
          aria-label="Chọn màn"
          value={screen}
          onChange={(e) => setScreen(e.target.value as ScreenId)}
          className={toolInput}
        >
          {groups.map(([group, items]) => (
            <optgroup key={group} label={GROUP_LABEL[group] ?? group}>
              {items.map(([id, title]) => (
                <option key={id} value={id}>
                  {title} ({id})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {jump.missing && <Note>Lưu ý: {jump.missing}. Màn có thể hiển thị trống.</Note>}
        <button
          type="button"
          className={toolButtonPrimary}
          onClick={() => {
            nav.push(screen, jump.params);
            dispatch({ type: "toast/push", message: `Đã nhảy tới màn ${SCREEN_REGISTRY[screen].title}.`, tone: "info" });
            close();
          }}
        >
          Đi tới màn này
        </button>
      </ToolSection>

      <ToolSection title="Kịch bản" hint="Một chạm: nạp dữ liệu rồi nhảy tới màn đáng xem nhất.">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm kịch bản (tên, số)…"
          aria-label="Tìm kịch bản"
          className={toolInput}
        />
        <ul className="flex flex-col gap-1.5">
          {filtered.map((sc) => {
            const current = sc.id === state.scenarioId;
            return (
              <li key={sc.id}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: "loadScenario", scenarioId: sc.id, jump: true });
                    close();
                  }}
                  className={`flex min-h-12 w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left hover:bg-surface-muted ${ring} ${
                    current ? "border-primary bg-primary-soft/40" : "border-border"
                  }`}
                >
                  <span className="mt-px flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-muted px-1 text-[11px] font-bold text-text">
                    {sc.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-5 text-text">{sc.title}</span>
                    <span className="block text-[12px] leading-4 text-muted">
                      {current ? "Đang dùng · " : ""}
                      {sc.jumpTo ? `Nhảy tới ${SCREEN_REGISTRY[sc.jumpTo.screen].title}` : "Giữ nguyên màn hiện tại"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <p className="text-[13px] text-muted">Không có kịch bản nào khớp.</p>}
        </ul>
      </ToolSection>
    </div>
  );
}
