"use client";

import { formatVnd } from "@/lib/format";
import { formatISODate } from "../../engine/dates";
import { goalValue } from "../../engine/value";
import { getScenario } from "../../data/scenarios";
import { usePreview } from "../../store/PreviewStore";
import { GoalStatusBadge } from "../../ui/shared/GoalStatusBadge";
import { ButtonGrid, Note, ToolSection, toolButton, toolButtonPrimary } from "./kit";

export function DataTab({ close }: { close: () => void }) {
  const { state, dispatch, toast } = usePreview();

  async function copyJson() {
    const { toasts, ...rest } = state;
    void toasts;
    const json = JSON.stringify(rest, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      toast(`Đã sao chép trạng thái (${Math.round(json.length / 1024)} KB) vào clipboard.`, "success");
    } catch {
      toast("Không sao chép được. Trình duyệt chặn clipboard.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolSection title="Tóm tắt">
        <Note>
          Kịch bản: {getScenario(state.scenarioId).title} · Ngày {formatISODate(state.clock.today)} · Tài khoản chính{" "}
          {formatVnd(state.customer.mainCasaBalance)} · {state.assets.length} tài sản · {state.loans.length} khoản vay · {state.txns.length} giao dịch
        </Note>
        <ul className="flex flex-col gap-1.5">
          {state.goals.map((g) => {
            const acc = state.accounts.find((a) => a.id === g.accountId);
            return (
              <li key={g.id} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{g.name}</span>
                  <GoalStatusBadge status={g.status} />
                </div>
                <p className="text-[12px] leading-4 text-muted">
                  Giá trị {formatVnd(goalValue(state, g).total)} / {formatVnd(g.targetAmount)} · Tài khoản {acc ? formatVnd(acc.balance) : "chưa mở"} · Đến hạn {formatISODate(g.targetDate)}
                </p>
                <p className="text-[12px] leading-4 text-muted">id {g.id} · ưu tiên {g.priority}</p>
              </li>
            );
          })}
          {state.goals.length === 0 && <Note>Chưa có mục tiêu nào.</Note>}
        </ul>
      </ToolSection>

      <ToolSection title="Thao tác">
        <ButtonGrid>
          <button
            type="button"
            className={toolButtonPrimary}
            onClick={() => {
              dispatch({ type: "reset" });
              close();
            }}
          >
            Đặt lại kịch bản
          </button>
          <button type="button" className={toolButton} onClick={copyJson}>Sao chép JSON</button>
        </ButtonGrid>
        <Note>Đặt lại nạp lại dữ liệu gốc của kịch bản đang dùng. Dữ liệu được lưu trong trình duyệt này.</Note>
      </ToolSection>
    </div>
  );
}
