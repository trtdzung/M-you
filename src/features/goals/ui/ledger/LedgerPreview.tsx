import { assessProgress } from "../../engine/progress";
import { transferNow } from "@/lib/demo-clock";
import type { SavingsGoalView } from "../../model/types";

export function LedgerPreview({ goal, amount, kind }: { goal: SavingsGoalView; amount?: number; kind: "deposit" | "withdraw" }) {
  const balance = goal.currentAmount + (kind === "deposit" ? 1 : -1) * (amount ?? 0);
  const progress = assessProgress({ ...goal, currentAmount: balance, now: transferNow() });
  return <div className="rounded-2xl border border-border bg-surface-muted p-4 text-[14px]">
    <p className="font-semibold text-text">{goal.name}</p>
    <dl className="mt-3 space-y-2"><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Đã tích lũy</dt><dd>{goal.currentAmount.toLocaleString("en-US")} VND</dd></div>
    {amount !== undefined && balance >= 0 && <><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Sau khi {kind === "deposit" ? "góp" : "rút"}</dt><dd className="font-semibold text-text">{balance.toLocaleString("en-US")} VND</dd></div><div className="flex justify-between gap-2"><dt className="text-muted">Tiến độ mới</dt><dd>{progress.percent}%</dd></div></>}
    </dl><p className="mt-3 text-[12px] leading-5 text-muted">Ghi nhận tích lũy của bạn, không chuyển tiền giữa tài khoản.</p>
  </div>;
}
