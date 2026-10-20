"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";
import { proposalKey } from "@/lib/agent-applied";
import { MONTHLY_DAY_MAX, sendGoalAction, type CloseGoalUi, type EditGoalUi } from "@/lib/agent-goal-api";
import { usePersona } from "@/providers/context";
import { useAppToday } from "@/state/app-clock";
import { GoalConfirmButton, GoalField, goalCardClass, goalFieldClass, parseWhole, useGoalCardState } from "./agent-goal-shared";

/**
 * Renders an `EditGoalUi` (change the date and/or the amount of a running goal) or a `CloseGoalUi`. The agent only
 * proposes; the confirm sends `extend`, `reduceTarget` and/or `setStandingOrder` (the monthly plan), or `closeGoal`, to the goals API. Several changes are several writes:
 * if the second is refused the first stays, the card says so and a retry sends only what is still missing.
 */
export function AgentGoalAdjustCard({ form, fullWidth = false }: { form: EditGoalUi | CloseGoalUi; fullWidth?: boolean }) {
  return form.type === "edit_goal" ? <EditGoal form={form} fullWidth={fullWidth} /> : <CloseGoal form={form} fullWidth={fullWidth} />;
}

function EditGoal({ form, fullWidth }: { form: EditGoalUi; fullWidth: boolean }) {
  const { persona } = usePersona();
  const today = useAppToday();
  const card = useGoalCardState(proposalKey(persona.cif, form));
  const [date, setDate] = useState(form.new_target_date ?? "");
  const [amount, setAmount] = useState(form.new_target_amount === undefined ? "" : String(form.new_target_amount));
  const [monthly, setMonthly] = useState(form.monthly_amount === undefined ? "" : String(form.monthly_amount));
  const [monthlyDay, setMonthlyDay] = useState(form.monthly_day ?? 5);
  const [dateDone, setDateDone] = useState(false);
  const [amountDone, setAmountDone] = useState(false);
  const [monthlyDone, setMonthlyDone] = useState(false);
  const done = card.status === "done";
  const wantsDate = form.new_target_date !== undefined;
  const wantsAmount = form.new_target_amount !== undefined;
  const wantsMonthly = form.monthly_amount !== undefined;

  async function confirm() {
    const newAmount = parseWhole(amount);
    if (wantsDate && !dateDone && (!date || date <= today)) return card.fail("Ngày mới phải sau hôm nay.");
    if (wantsAmount && !amountDone && (newAmount === null || newAmount <= 0)) return card.fail("Số tiền mục tiêu phải lớn hơn 0.");
    const monthlyAmount = parseWhole(monthly);
    if (wantsMonthly && !monthlyDone && (monthlyAmount === null || monthlyAmount <= 0)) return card.fail("Số tiền góp mỗi tháng phải lớn hơn 0.");
    card.start();
    if (wantsDate && !dateDone) {
      const r = await sendGoalAction(persona.cif, { type: "extend", goalId: form.goal_id, newTargetDate: date });
      if (!r.ok) return card.fail(r.error);
      setDateDone(true);
    }
    if (wantsAmount && !amountDone) {
      const r = await sendGoalAction(persona.cif, { type: "reduceTarget", goalId: form.goal_id, newTargetAmount: newAmount! });
      if (!r.ok) return card.fail(wantsDate ? `Đã đổi ngày nhưng chưa đổi được số tiền: ${r.error}` : r.error);
      setAmountDone(true);
    }
    if (wantsMonthly && !monthlyDone) {
      const r = await sendGoalAction(persona.cif, { type: "setStandingOrder", goalId: form.goal_id, amount: monthlyAmount!, dayOfMonth: monthlyDay });
      if (!r.ok) return card.fail(wantsDate || wantsAmount ? `Đã đổi mục tiêu nhưng chưa đổi được số góp hằng tháng: ${r.error}` : r.error);
      setMonthlyDone(true);
    }
    card.finish();
  }

  const touch = (set: (v: string) => void) => (v: string) => {
    card.setProblem(null);
    set(v);
  };
  return (
    <div className={goalCardClass(fullWidth)}>
      <p className="text-[11px] font-semibold text-muted">Đề xuất điều chỉnh mục tiêu</p>
      <p className="text-sm font-semibold text-text">{form.goal_name}</p>
      {wantsDate && (
        <GoalField label="Ngày hoàn thành mới">
          <input type="date" value={date} min={today} onChange={(e) => touch(setDate)(e.target.value)} disabled={done || dateDone} className={goalFieldClass} />
        </GoalField>
      )}
      {wantsAmount && (
        <GoalField label="Số tiền mục tiêu mới">
          <input value={amount} onChange={(e) => touch(setAmount)(e.target.value)} inputMode="numeric" disabled={done || amountDone} className={`${goalFieldClass} font-semibold tabular-nums`} />
        </GoalField>
      )}
      {wantsAmount && parseWhole(amount) !== null && parseWhole(amount)! > 0 && <p className="text-[11px] text-muted">Mục tiêu mới: {formatVnd(parseWhole(amount)!)}</p>}
      {wantsMonthly && (
        <>
          <GoalField label="Góp mỗi tháng (trích tự động)">
            <input value={monthly} onChange={(e) => touch(setMonthly)(e.target.value)} inputMode="numeric" disabled={done || monthlyDone} className={`${goalFieldClass} font-semibold tabular-nums`} />
          </GoalField>
          <GoalField label="Ngày trích hằng tháng">
            <select value={monthlyDay} onChange={(e) => { card.setProblem(null); setMonthlyDay(Number(e.target.value)); }} disabled={done || monthlyDone} className={goalFieldClass}>
              {Array.from({ length: MONTHLY_DAY_MAX }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>Ngày {d}</option>
              ))}
            </select>
          </GoalField>
        </>
      )}
      {card.problem && <p role="alert" className="text-xs text-negative">{card.problem}</p>}
      <GoalConfirmButton label="Cập nhật mục tiêu" busyLabel="Đang lưu…" doneLabel="Đã cập nhật mục tiêu" status={card.status} onClick={confirm} />
    </div>
  );
}

function CloseGoal({ form, fullWidth }: { form: CloseGoalUi; fullWidth: boolean }) {
  const { persona } = usePersona();
  const card = useGoalCardState(proposalKey(persona.cif, form));
  const [understood, setUnderstood] = useState(false);

  async function confirm() {
    card.start();
    const r = await sendGoalAction(persona.cif, { type: "closeGoal", goalId: form.goal_id });
    if (!r.ok) return card.fail(r.error);
    card.finish();
  }

  return (
    <div className={goalCardClass(fullWidth)}>
      <p className="text-[11px] font-semibold text-negative">Đề xuất đóng mục tiêu</p>
      <p className="text-sm font-semibold text-text">{form.goal_name}</p>
      <ul className="list-disc pl-4 text-xs text-muted">
        <li>Tiền trong tài khoản mục tiêu được chuyển về tài khoản chính.</li>
        <li>Tài sản MSB gắn với mục tiêu (nếu có) sẽ được bán.</li>
        <li>Tài khoản mục tiêu bị đóng. Việc này không hoàn tác được.</li>
      </ul>
      <label className="flex items-start gap-2 text-xs text-text">
        <input type="checkbox" checked={understood} disabled={card.status !== "idle"} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
        Tôi hiểu và muốn đóng mục tiêu này
      </label>
      {card.problem && <p role="alert" className="text-xs text-negative">{card.problem}</p>}
      <GoalConfirmButton label="Đóng mục tiêu" busyLabel="Đang đóng…" doneLabel="Đã đóng mục tiêu" status={card.status} disabled={!understood} danger onClick={confirm} />
    </div>
  );
}
