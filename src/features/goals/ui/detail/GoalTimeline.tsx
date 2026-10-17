"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildGoalTimeline } from "./goal-timeline-data";
import { transferNow } from "@/lib/demo-clock";
import { formatVndCompact } from "@/lib/format";
import type { GoalLedgerEntry, SavingsGoalView } from "../../model/types";

export function GoalTimeline({ goal, ledger }: { goal: SavingsGoalView; ledger: GoalLedgerEntry[] }) {
  const now = transferNow().getTime();
  const points = buildGoalTimeline(goal, ledger, new Date(now));
  const dateLabel = (time: number) => new Date(time).toLocaleDateString("vi-VN", { month: "2-digit", year: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  return <section className="rounded-2xl border border-border bg-surface p-4">
    <h2 className="text-[18px] font-semibold text-text">Hành trình tích lũy</h2>
    <p className="mt-1 text-[13px] leading-5 text-muted">So sánh số đã ghi nhận với kế hoạch đến hạn.</p>
    <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-muted"><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" />Thực tế</span><span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-slate-400" />Kế hoạch</span></div>
    <div className="mt-4 h-56 w-full" role="img" aria-label={`Đã tích lũy ${formatVndCompact(goal.currentAmount)}, kế hoạch hôm nay ${formatVndCompact(goal.progress.expectedAmount)}, mục tiêu ${formatVndCompact(goal.targetAmount)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{top:12,right:12,bottom:0,left:0}}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} tickFormatter={dateLabel} tick={{fontSize:11}} minTickGap={32} axisLine={false} tickLine={false} />
          <YAxis width={54} tickFormatter={formatVndCompact} tick={{fontSize:11}} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={time => new Date(Number(time)).toLocaleDateString("vi-VN")} formatter={(amount: number) => `${amount.toLocaleString('en-US')} VND`} contentStyle={{borderRadius:12,fontSize:13}} />
          <ReferenceLine x={now} stroke="#94a3b8" strokeDasharray="3 3" label={{value:'Hôm nay',position:'insideTopRight',fontSize:11}} />
          <Line name="Kế hoạch" dataKey="plan" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
          <Line name="Thực tế" dataKey="actual" type="stepAfter" connectNulls stroke="var(--color-primary)" strokeWidth={3} dot={{r:4}} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <p className="mt-2 text-[12px] leading-5 text-muted">Thực tế: bạn tự ghi nhận. Kế hoạch: tích lũy đều từ ngày tạo đến hạn, không tính lãi.{ledger.length === 0 ? " Chưa có lịch sử để vẽ đường thực tế; chỉ hiển thị số hiện tại." : " Chạm biểu đồ để xem từng mốc."}</p>
  </section>;
}
