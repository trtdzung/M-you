// DEFERRED: unmounted in the 3-tab reformat (Tổng quan · Hũ · Dòng tiền). The
// Kế hoạch UI (goals, health, surplus what-if) is off the tab bar; the engine +
// tests are kept intact to re-enable later. See plans/260909-2254-pfm-3tab-reformat/
// and the deferred inventory in plans/project-backlog.md.
"use client";

import { SectionHeader } from "@/components/primitives";
import { ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { HealthPanel } from "@/components/wealth/HealthPanel";
import { SurplusPanel } from "@/components/jars/SurplusPanel";
import { useFinancials } from "@/state/useFinancials";
import { GoalList } from "./GoalList";

/**
 * Kế hoạch tab — the "Cuối tháng ổn? / Làm gì?" panel. Hosts the Mục tiêu module
 * (list + editor + direct-tap `simulateGoal` what-if), the surplus what-if
 * (relocated from the orphaned jars route — surplus IS the jar residual), and the
 * financial-health indicators (relocated from the retired Wealth tab). Every
 * number comes from the deterministic engine via `useFinancials` (invariant #1);
 * nothing here moves money or mutates a goal (#2/#3).
 */
export function PlanTab() {
  const { loading, error, financials } = useFinancials();

  return (
    <div className="flex flex-col gap-5 pb-6">
      {error && <ErrorState />}
      {loading && !financials && (
        <SkeletonScreen>
          <SkeletonCard className="h-32" />
          <SkeletonCard className="h-24" />
        </SkeletonScreen>
      )}

      {financials && (
        <>
          <GoalList />

          <section className="flex flex-col gap-2">
            <SectionHeader
              title="Thặng dư"
              subtitle="Mô phỏng phân bổ phần chưa phân bổ vào mục tiêu"
              className="mb-0"
            />
            <SurplusPanel />
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeader
              title="Sức khỏe tài chính"
              subtitle="Chỉ số ước tính từ dữ liệu của bạn"
              className="mb-0"
            />
            <HealthPanel health={financials.health} />
          </section>
        </>
      )}
    </div>
  );
}
