import type { BudgetLine, BudgetStatus } from "@/domain/engine";
import { PressureRow } from "./PressureRow";

const STATUS_LABEL: Record<BudgetStatus, string> = {
  ok: "Trong hạn mức",
  near: "Sắp vượt",
  over: "Vượt hạn mức",
};

/** Per-category budget usage with pressure state. */
export function BudgetList({ lines }: { lines: BudgetLine[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {lines.map((line) => (
        <li key={line.categoryId}>
          <PressureRow
            label={line.label}
            used={line.used}
            limit={line.limit}
            pct={line.pct}
            variant={line.status}
            statusLabel={STATUS_LABEL[line.status]}
            rightLabel={line.daysLeft > 0 ? `Còn ${line.daysLeft} ngày` : "Đã hết kỳ"}
          />
        </li>
      ))}
    </ul>
  );
}
