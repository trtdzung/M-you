// DEFERRED: unmounted in the 3-tab reformat — engine/tests kept, UI re-enabled
// later. See plans/260909-2254-pfm-3tab-reformat/ and plans/project-backlog.md.
"use client";

import { useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import type { GoalRecord } from "@/domain/models/goal-input";
import { simulateGoal } from "@/domain/engine";
import { DEMO_NOW, monthKeyLabel } from "@/lib/demo-clock";
import { Card, Money } from "@/components/primitives";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<string, string> = {
  already_met: "Đã đạt mục tiêu",
  achievable: "Có thể đạt",
  unreachable: "Chưa khả thi",
  unknown: "Chưa đủ dữ kiện",
};

/**
 * Direct-tap goal what-if: "nếu tiết kiệm X ₫/tháng thì bao giờ đạt?". Surfaces
 * `simulateGoal` — the EXACT engine fn the chat's `simulateGoal` tool calls (the
 * engine owns every number, invariant #1) — as a slider, so the projection is
 * available without the chat. A read-only simulation: it never mutates the goal
 * or moves money (#2/#3), and states its assumptions (§8). Missing contribution
 * stays unknown, never 0 (#6).
 */
export function GoalProjectionCard({ goal }: { goal: GoalRecord }) {
  const [contribution, setContribution] = useState<number | null>(goal.monthlyContribution);

  const projection = useMemo(
    () => simulateGoal(goal, { monthlyContribution: contribution, asOf: DEMO_NOW }),
    [goal, contribution],
  );

  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  // Slider ceiling: enough to clear the remaining amount in a single month, with
  // a sane floor so a fully-funded goal still renders a usable control.
  const sliderMax = Math.max(remaining, 1_000_000);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <LineChart size={18} className="text-primary" />
        <span className="flex-1 text-sm font-bold text-text">Mô phỏng: {goal.name}</span>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Đóng góp mỗi tháng
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={100_000}
          value={contribution ?? 0}
          onChange={(e) => setContribution(Number(e.target.value) || null)}
          aria-label={`Đóng góp mỗi tháng cho ${goal.name}`}
          className="w-full accent-primary"
        />
        <Money amount={contribution ?? "unknown"} className="self-end font-semibold text-text" />
      </label>

      <div className="flex items-center justify-between rounded-2xl bg-surface-muted/40 px-3 py-2 text-sm">
        <span className="text-muted">Trạng thái</span>
        <span
          className={cn(
            "font-semibold",
            projection.status === "achievable" || projection.status === "already_met"
              ? "text-positive"
              : projection.status === "unreachable"
                ? "text-negative"
                : "text-muted",
          )}
        >
          {STATUS_LABEL[projection.status]}
        </span>
      </div>

      {projection.status === "unknown" ? (
        <p className="text-sm text-muted">
          Kéo thanh trượt để đặt mức đóng góp hằng tháng — chưa có mức thì chưa dự phóng được (không mặc định 0).
        </p>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Dự kiến đạt</span>
          <span className="font-semibold text-text">
            {projection.monthsToTarget != null
              ? `${projection.monthsToTarget} tháng (${projection.targetDate ? monthKeyLabel(projection.targetDate) : "—"})`
              : "—"}
          </span>
        </div>
      )}

      <ul className="border-t border-border pt-2 text-[11px] text-muted">
        {projection.assumptions.map((a) => (
          <li key={a}>• {a}</li>
        ))}
        <li>• Chỉ là mô phỏng — không chuyển tiền, không thay đổi mục tiêu.</li>
      </ul>
    </Card>
  );
}
