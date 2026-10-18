import "server-only";

import type { GoalFlexibility } from "../model/types";
import { addMonthsToDate } from "../engine/months";
import { goalsDb } from "./db";

interface DemoGoal {
  name: string;
  targetAmount: number;
  /** "YYYY-MM-DD". */
  createdOn: string;
  targetDate: string;
  flexibility: GoalFlexibility;
  monthlyContribution: number;
  /** One deposit per month, starting on `createdOn`. */
  deposits: number[];
  withdraw?: { amount: number; on: string; note: string };
}

const repeat = (amount: number, n: number) => Array<number>(n).fill(amount);

/** Sample goals backdated so every progress state can be demoed (the demo clock never moves). */
export const DEMO_GOALS: Record<string, DemoGoal[]> = {
  CIF_0001: [
    {
      name: "Mua xe",
      targetAmount: 600_000_000,
      createdOn: "2025-09-15",
      targetDate: "2028-09-15",
      flexibility: "flexible",
      monthlyContribution: 17_100_000,
      deposits: repeat(17_100_000, 12),
    },
    {
      name: "Quỹ dự phòng",
      targetAmount: 90_000_000,
      createdOn: "2026-03-15",
      targetDate: "2027-03-15",
      flexibility: "fixed",
      monthlyContribution: 6_300_000,
      deposits: [...repeat(6_300_000, 4), ...repeat(6_400_000, 2)],
    },
    {
      name: "Du lịch Nhật",
      targetAmount: 60_000_000,
      createdOn: "2026-01-15",
      targetDate: "2026-12-15",
      flexibility: "flexible",
      monthlyContribution: 3_125_000,
      deposits: repeat(3_125_000, 8),
      withdraw: {
        amount: 5_000_000,
        on: "2026-07-10",
        note: "Tôi chấp nhận lùi mục tiêu Du lịch Nhật",
      },
    },
  ],
  CIF_0002: [
    {
      name: "Đệm thu nhập",
      targetAmount: 60_000_000,
      createdOn: "2026-05-15",
      targetDate: "2027-05-15",
      flexibility: "flexible",
      monthlyContribution: 7_500_000,
      deposits: repeat(7_500_000, 4),
    },
  ],
  CIF_0003: [
    {
      name: "Nhà nghỉ dưỡng",
      targetAmount: 2_000_000_000,
      createdOn: "2025-03-15",
      targetDate: "2028-03-15",
      flexibility: "fixed",
      monthlyContribution: 58_300_000,
      deposits: [...repeat(58_300_000, 17), 58_900_000],
    },
  ],
};

const iso = (date: string) => `${date}T00:00:00.000Z`;

/** Inserts the sample goals for `cif` in one transaction; re-running adds nothing. */
export function seedDemoGoals(cif: string): { inserted: number } {
  const goals = DEMO_GOALS[cif];
  if (!goals) return { inserted: 0 };
  const db = goalsDb();
  const insertGoal = db.prepare(
    `INSERT OR IGNORE INTO user_goals (cif, id, name, target_amount, target_date, flexibility,
       monthly_contribution, status, jar_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
  );
  const insertEntry = db.prepare(
    `INSERT OR IGNORE INTO user_goal_ledger (cif, id, goal_id, kind, amount, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  return db.transaction(() => {
    let inserted = 0;
    goals.forEach((g, i) => {
      const id = `demo_${cif}_${i + 1}`;
      const created = iso(g.createdOn);
      inserted += insertGoal.run(
        cif, id, g.name, g.targetAmount, g.targetDate, g.flexibility, g.monthlyContribution, created, created,
      ).changes;
      g.deposits.forEach((amount, k) => {
        insertEntry.run(cif, `${id}_${k + 1}`, id, "deposit", amount, null, iso(addMonthsToDate(g.createdOn, k)));
      });
      if (g.withdraw) {
        const { amount, on, note } = g.withdraw;
        insertEntry.run(cif, `${id}_${g.deposits.length + 1}`, id, "withdraw", amount, note, iso(on));
      }
    });
    return { inserted };
  })();
}
