"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleAlert, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { formatISODate } from "../../../engine";
import { TXN_LABEL } from "../../../model/labels";
import { TXN_DIRECTION, type GoalTxnKind } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { selectGoalTxns } from "../../../store/selectors";
import { Amount } from "../../shared/Amount";
import { SourceTag } from "../../shared/SourceTag";
import { card, input, ring, sectionTitle, secondaryButton } from "../../shared/styles";
import { canTransact, type GoalContext } from "./common";

type Filter = "all" | "deposit" | "withdraw" | "interest" | "invest" | "maturity" | "loan_disbursement" | "loan_repayment" | "failed";

const FILTERS: { value: Filter; label: string; kinds?: GoalTxnKind[] }[] = [
  { value: "all", label: "Tất cả" },
  { value: "deposit", label: "Nạp", kinds: ["deposit", "standing_order"] },
  { value: "withdraw", label: "Rút", kinds: ["withdraw"] },
  { value: "interest", label: "Lãi", kinds: ["interest"] },
  { value: "invest", label: "Đầu tư", kinds: ["invest", "divest"] },
  { value: "maturity", label: "Đáo hạn", kinds: ["maturity"] },
  { value: "loan_disbursement", label: "Giải ngân", kinds: ["loan_disbursement"] },
  { value: "loan_repayment", label: "Trả nợ", kinds: ["loan_repayment"] },
  { value: "failed", label: "Trích thất bại", kinds: ["standing_order_failed"] },
];

export function CashTab({ ctx, goalId }: { ctx: GoalContext; goalId: string }) {
  const { nav, toast } = usePreview();
  const { goal, account, state } = ctx;
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(10);
  const txns = selectGoalTxns(state, goalId);
  const kinds = FILTERS.find((f) => f.value === filter)?.kinds;
  const shown = kinds ? txns.filter((t) => kinds.includes(t.kind)) : txns;
  const groups = shown.slice(0, limit).reduce<Record<string, typeof shown>>((all, txn) => {
    const day = txn.date.slice(0, 10);
    (all[day] ??= []).push(txn);
    return all;
  }, {});
  const interestEarned = txns.filter((t) => t.kind === "interest").reduce((s, t) => s + t.amount, 0);
  const so = goal.standingOrder;

  async function copy() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.number);
      toast("Đã sao chép số tài khoản.", "success");
    } catch {
      toast(`Số tài khoản: ${account.number}`, "info");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {account ? (
        <section className={`${card} flex flex-col gap-3`} aria-label="Tài khoản mục tiêu">
          <div className="flex items-center justify-between gap-2">
            <h2 className={sectionTitle}>Tài khoản mục tiêu</h2>
            <SourceTag source="msb" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm tabular-nums text-text">{account.number}</p>
            <button type="button" onClick={copy} aria-label="Sao chép số tài khoản" className={`flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-muted ${ring}`}>
              <Copy size={18} />
            </button>
          </div>
          <div>
            <p className="text-[12px] text-muted">Số dư</p>
            <Amount amount={account.balance} className="text-[22px] font-bold text-text" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[12px] text-muted">Lãi suất không kỳ hạn</p>
              <p className="font-semibold text-text">{account.interestRatePa}%/năm</p>
            </div>
            <div>
              <p className="text-[12px] text-muted">Lãi đã nhận</p>
              <Amount amount={interestEarned} className="font-semibold text-text" />
            </div>
          </div>
          {account.status === "closed" && <p className="text-[13px] text-muted">Tài khoản đã đóng ngày {formatISODate(goal.closedAt)}.</p>}
        </section>
      ) : (
        <p className="rounded-card bg-surface-muted p-4 text-sm text-muted">Mục tiêu chưa có tài khoản.</p>
      )}

      <section className={`${card} flex flex-col gap-2`}>
        <h2 className={sectionTitle}>Trích tiền tự động</h2>
        {so && so.amount > 0 ? (
          <p className="text-sm text-text">
            {formatVnd(so.amount)} vào ngày {so.dayOfMonth} hằng tháng ·{" "}
            <span className={so.active ? "text-positive" : "text-muted"}>{so.active ? "Đang bật" : "Đang tắt"}</span>
            {so.failedCount > 0 && <span className="text-negative"> · lỗi {so.failedCount} lần liên tiếp</span>}
          </p>
        ) : (
          <p className="text-sm text-muted">Chưa thiết lập. Trích đều mỗi tháng giúp bạn đúng tiến độ.</p>
        )}
        {canTransact(goal) && (
          <button type="button" className={secondaryButton} onClick={() => nav.push("StandingOrderManage", { goalId })}>
            {so && so.amount > 0 ? "Quản lý trích tự động" : "Thiết lập trích tự động"}
          </button>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}>Lịch sử giao dịch</h2>
          <select aria-label="Lọc loại giao dịch" value={filter} onChange={(event) => { setFilter(event.target.value as Filter); setLimit(10); }} className={`${input} !w-auto max-w-full !py-2 !text-[13px]`}>
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <p className="text-[12px] text-muted">{shown.length} giao dịch{filter !== "all" ? ` · ${FILTERS.find((f) => f.value === filter)?.label}` : ""}</p>
        {shown.length === 0 ? (
          <p className="rounded-card bg-surface-muted p-4 text-center text-sm text-muted">Chưa có giao dịch nào.</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            {Object.entries(groups).map(([day, entries]) => (
              <div key={day} className="min-w-0">
                <h3 className="mb-2 text-[12px] font-medium text-muted">{formatISODate(day)}</h3>
                <ul className="divide-y divide-border rounded-card bg-surface shadow-card">
                  {entries.map((t) => {
                    const dir = TXN_DIRECTION[t.kind];
                    const Icon = t.kind === "standing_order_failed" ? CircleAlert : dir > 0 ? ArrowDownLeft : ArrowUpRight;
                    return (
                      <li key={t.id} className="flex min-w-0 gap-3 p-4">
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", t.kind === "standing_order_failed" ? "bg-warning-soft text-warning" : dir > 0 ? "bg-positive-soft text-positive" : "bg-surface-muted text-text")}><Icon size={18} aria-hidden /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                            <p className={cn("text-sm font-semibold", t.kind === "standing_order_failed" ? "text-negative" : "text-text")}>{TXN_LABEL[t.kind]}</p>
                            <span className={cn("whitespace-nowrap text-sm font-semibold tabular-nums", dir > 0 ? "text-positive" : "text-text")}>{dir > 0 ? "+" : dir < 0 ? "−" : ""}{formatVnd(t.amount)}</span>
                          </div>
                          {t.note && <p className="mt-1 break-words text-[12px] leading-5 text-muted">{t.note}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        {shown.length > limit && <button type="button" className={secondaryButton} onClick={() => setLimit((current) => current + 10)}>Xem thêm giao dịch ({shown.length - limit})</button>}
      </section>
    </div>
  );
}
