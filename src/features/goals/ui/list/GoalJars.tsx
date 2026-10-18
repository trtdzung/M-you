"use client";

import { useRouter } from "next/navigation";
import { pushWithTransition } from "@/lib/view-transition";
import { Card, SectionHeader } from "@/components/primitives";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { formatGoalMoney } from "../shared/format-goal-money";
import { GoalProgressBar } from "../shared/GoalProgressBar";

/** Dedicated savings jars use the goal ledger, never a spending budget or a bank balance. */
export function GoalJars() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  if (loading) return <p role="status" className="text-sm text-muted">Đang tải hũ mục tiêu…</p>;
  if (error !== null) return <div className="text-sm text-muted"><p>Chưa tải được hũ mục tiêu.</p><button type="button" className="min-h-11 text-primary" onClick={refresh}>Thử lại hũ mục tiêu</button></div>;
  const goals = data?.filter(goal => goal.jarId && goal.status !== "archived") ?? [];
  if (!goals.length) return null;
  return <section className="flex flex-col gap-3">
    <SectionHeader title="Hũ mục tiêu" subtitle="Tích lũy bạn tự ghi nhận · Không tính vào hạn mức chi tiêu" />
    {goals.map(goal => <button key={goal.jarId} type="button" onClick={() => pushWithTransition((href) => router.push(href), `/goals/${goal.id}?from=budget`)} className="w-full rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
      <Card padding="snug" className="flex flex-col gap-2">
        <p className="font-semibold text-text">{goal.name}</p>
        <p className="text-sm text-muted">Đã tích lũy <strong className="text-text">{formatGoalMoney(goal.currentAmount)} VND</strong> / {formatGoalMoney(goal.targetAmount)} VND</p>
        <GoalProgressBar percent={goal.progress.percent} state={goal.progress.state} />
        <p className="text-xs text-muted">{goal.status === "paused" ? "Tạm dừng" : "Đang tích lũy"} · Đến {goal.targetDate.split("-").reverse().join("/")}</p>
      </Card>
    </button>)}
  </section>;
}
