import { DEMO_NOW } from "@/lib/demo-clock";
import type { Detector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/** Flags the largest known upcoming obligation within the horizon. */
export const upcomingObligation: Detector = (f) => {
  const known = f.obligations.filter((o) => o.amount !== "unknown");
  if (known.length === 0) return null;

  const top = known.reduce((m, o) => ((o.amount as number) > (m.amount as number) ? o : m));
  const amount = top.amount as number;
  const days = Math.max(0, Math.ceil((new Date(top.dueDate).getTime() - DEMO_NOW.getTime()) / 86_400_000));

  return buildInsight({
    id: `upcomingObligation:${top.id}`,
    type: "upcoming_obligation",
    severity: days <= 7 ? "urgent" : "attention",
    title: `Sắp đến hạn: ${top.label}`,
    explanation: `Khoản "${top.label}" khoảng ${money(amount)} sẽ đến hạn trong ${days} ngày.`,
    facts: [fact("Số tiền", amount), fact("Số ngày còn lại", days)],
    confidence: 0.9,
    actionType: "prepare_payment",
  });
};
