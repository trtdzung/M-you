import { useState } from "react";
import { formatVnd } from "@/lib/format";
import { proposalKey } from "@/lib/agent-applied";
import { MONTHLY_DAY_MAX, TEMPLATE_LABELS, sendGoalAction, type CreateGoalUi, type GoalTemplate } from "@/lib/agent-goal-api";
import { usePersona } from "@/providers/context";
import { useAppToday } from "@/state/app-clock";
import { GoalConfirmButton, GoalField, goalCardClass, goalFieldClass, parseWhole, useGoalCardState } from "./agent-goal-shared";

const MONTHLY_DAYS = Array.from({ length: MONTHLY_DAY_MAX }, (_, i) => i + 1);

/**
 * Renders a `CreateGoalUi`: the agent's proposal for a new savings goal. Every field is editable; "Tạo mục tiêu" is the
 * customer's confirmation, after which pfm writes ONE `createGoal` (goal, goal account, opening deposit taken from the main
 * account, and the monthly auto-debit when the plan has an amount). There is no draft: a refused action creates nothing.
 */
export function AgentGoalCreateCard({ form, fullWidth = false }: { form: CreateGoalUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const today = useAppToday();
  const key = proposalKey(persona.cif, form);
  const card = useGoalCardState(key);

  const [name, setName] = useState(form.goal_name);
  const [template, setTemplate] = useState<GoalTemplate>(form.template);
  const [amount, setAmount] = useState(String(form.target_amount));
  const [date, setDate] = useState(form.target_date);
  const [deposit, setDeposit] = useState(String(form.initial_deposit));
  const [monthly, setMonthly] = useState(form.monthly_amount === undefined ? "" : String(form.monthly_amount));
  const [monthlyDay, setMonthlyDay] = useState(form.monthly_day ?? 5);
  const done = card.status === "done";
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    card.setProblem(null);
    set(v);
  };

  async function confirm() {
    const targetAmount = parseWhole(amount);
    const initialDeposit = parseWhole(deposit);
    const monthlyAmount = monthly.trim() === "" ? 0 : parseWhole(monthly);
    if (!name.trim()) return card.fail("Nhập tên mục tiêu.");
    if (targetAmount === null || targetAmount <= 0) return card.fail("Số tiền mục tiêu phải lớn hơn 0.");
    if (!date || date <= today) return card.fail("Ngày hoàn thành phải sau hôm nay.");
    if (initialDeposit === null) return card.fail("Nhập số tiền nạp ban đầu (nhập 0 nếu chưa nạp).");
    if (monthlyAmount === null) return card.fail("Số tiền góp mỗi tháng không hợp lệ (để trống nếu chưa cài trích tự động).");
    card.start();

    const created = await sendGoalAction(persona.cif, {
      type: "createGoal",
      input: {
        name: name.trim(),
        template,
        targetAmount,
        targetDate: date,
        flexibility: "date_flexible",
        initialDeposit,
        ...(monthlyAmount > 0 ? { standingOrder: { amount: monthlyAmount, dayOfMonth: monthlyDay } } : {}),
      },
    });
    if (!created.ok) return card.fail(created.error);
    card.finish();
  }

  return (
    <div className={goalCardClass(fullWidth)}>
      <p className="text-[11px] font-semibold text-muted">Đề xuất tạo mục tiêu mới</p>
      <GoalField label="Tên mục tiêu">
        <input value={name} onChange={(e) => touch(setName)(e.target.value)} disabled={done} className={goalFieldClass} />
      </GoalField>
      <GoalField label="Loại mục tiêu">
        <select value={template} onChange={(e) => touch(setTemplate)(e.target.value as GoalTemplate)} disabled={done} className={goalFieldClass}>
          {Object.entries(TEMPLATE_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </GoalField>
      <GoalField label="Số tiền mục tiêu">
        <input value={amount} onChange={(e) => touch(setAmount)(e.target.value)} inputMode="numeric" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
      </GoalField>
      <GoalField label="Ngày hoàn thành">
        <input type="date" value={date} min={today} onChange={(e) => touch(setDate)(e.target.value)} disabled={done} className={goalFieldClass} />
      </GoalField>
      <GoalField label="Nạp ban đầu" hint="Trừ từ tài khoản chính khi bạn xác nhận. Nhập 0 nếu chưa nạp.">
        <input value={deposit} onChange={(e) => touch(setDeposit)(e.target.value)} inputMode="numeric" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
      </GoalField>
      <GoalField label="Góp mỗi tháng" hint="Trích tự động từ tài khoản chính vào tài khoản mục tiêu. Để trống nếu chưa cài.">
        <input value={monthly} onChange={(e) => touch(setMonthly)(e.target.value)} inputMode="numeric" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
      </GoalField>
      {monthly.trim() !== "" && (
        <GoalField label="Ngày trích hằng tháng">
          <select value={monthlyDay} onChange={(e) => touch(setMonthlyDay)(Number(e.target.value))} disabled={done} className={goalFieldClass}>
            {MONTHLY_DAYS.map((d) => (
              <option key={d} value={d}>Ngày {d}</option>
            ))}
          </select>
        </GoalField>
      )}
      {parseWhole(amount) !== null && parseWhole(amount)! > 0 && <p className="text-[11px] text-muted">Mục tiêu: {formatVnd(parseWhole(amount)!)}</p>}

      {card.problem && <p role="alert" className="text-xs text-negative">{card.problem}</p>}
      <GoalConfirmButton
        label="Tạo mục tiêu"
        busyLabel="Đang lưu…"
        doneLabel="Đã tạo mục tiêu"
        status={card.status}
        onClick={confirm}
      />
    </div>
  );
}
