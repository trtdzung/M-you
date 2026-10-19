"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";
import type { SimEvent } from "../../store/actions";
import type { Goal } from "../../model/types";
import { usePreview } from "../../store/PreviewStore";
import { parseVndInput } from "../../ui/shared/MoneyInput";
import { ButtonGrid, Note, ToolSection, toolButton, toolButtonPrimary, toolInput } from "./kit";

function MoneyField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = parseVndInput(e.target.value);
          onChange(n === null ? "" : new Intl.NumberFormat("en-US").format(n));
        }}
        className={toolInput}
      />
    </label>
  );
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export function EventTab({ goal }: { goal: Goal | undefined }) {
  const { state, dispatch } = usePreview();
  const c = state.customer;
  const [income, setIncome] = useState(fmt(c.monthlyIncome));
  const [unknownSurplus, setUnknownSurplus] = useState(c.monthlySurplus === "unknown");
  const [surplus, setSurplus] = useState(c.monthlySurplus === "unknown" ? "" : fmt(c.monthlySurplus));
  const [balance, setBalance] = useState(fmt(c.mainCasaBalance));

  const fire = (event: SimEvent) => dispatch({ type: "triggerEvent", event, goalId: goal?.id });
  const shift = state.market.fundPriceShiftPct;

  function applyCustomer() {
    const inc = parseVndInput(income);
    const bal = parseVndInput(balance);
    const sur = unknownSurplus ? ("unknown" as const) : parseVndInput(surplus);
    dispatch({
      type: "setCustomer",
      patch: {
        ...(inc !== null ? { monthlyIncome: inc } : {}),
        ...(bal !== null ? { mainCasaBalance: bal } : {}),
        ...(sur !== null ? { monthlySurplus: sur } : {}),
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolSection title="Sự kiện" hint={goal ? `Áp dụng cho: ${goal.name}` : "Chưa chọn mục tiêu"}>
        <ButtonGrid>
          <button type="button" className={toolButton} onClick={() => fire("salary")}>Lương về</button>
          <button type="button" className={toolButton} onClick={() => fire("bigExpense")}>Chi tiêu lớn (−12 tr)</button>
          <button type="button" className={toolButton} onClick={() => fire("standingOrderFail")}>Trích định kỳ thất bại</button>
          <button type="button" className={toolButton} onClick={() => fire("overdue")}>Quá hạn trả góp</button>
        </ButtonGrid>
      </ToolSection>

      <ToolSection title="Giá chứng chỉ quỹ" hint={`Đang lệch ${shift > 0 ? "+" : ""}${shift}% so với chuỗi giá gốc.`}>
        <ButtonGrid cols={3}>
          <button type="button" className={toolButton} onClick={() => dispatch({ type: "setFundPriceShift", pct: -10 })}>−10%</button>
          <button type="button" className={toolButton} onClick={() => dispatch({ type: "setFundPriceShift", pct: 0 })}>Gốc</button>
          <button type="button" className={toolButton} onClick={() => dispatch({ type: "setFundPriceShift", pct: 10 })}>+10%</button>
        </ButtonGrid>
      </ToolSection>

      <ToolSection title="Hồ sơ khách (sửa nhanh)">
        <MoneyField label="Thu nhập hằng tháng (VND)" value={income} onChange={setIncome} />
        <MoneyField label="Số dư hằng tháng (VND)" value={surplus} onChange={setSurplus} disabled={unknownSurplus} />
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-text">
          <input type="checkbox" checked={unknownSurplus} onChange={(e) => setUnknownSurplus(e.target.checked)} className="h-5 w-5" />
          Chưa đủ dữ liệu (số dư “chưa rõ”)
        </label>
        <MoneyField label="Số dư tài khoản chính (VND)" value={balance} onChange={setBalance} />
        <button type="button" className={toolButtonPrimary} onClick={applyCustomer}>Áp dụng</button>
        <Note>
          Hiện tại: thu nhập {formatVnd(c.monthlyIncome)}, số dư/tháng {c.monthlySurplus === "unknown" ? "chưa rõ" : formatVnd(c.monthlySurplus)}, tài khoản chính {formatVnd(c.mainCasaBalance)}.
        </Note>
      </ToolSection>
    </div>
  );
}
