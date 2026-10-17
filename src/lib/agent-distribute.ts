/**
 * The "Agent suggests how to split the unallocated amount" step of the "Chia ngay"
 * sheet: `POST /jar-distribute` (`agent_backend_docs/jars/distribute-amount.md`) for
 * the whole "Chờ phân bổ" amount, the answer PRE-FILLS the sheet's per-jar draft.
 *
 * The agent only proposes. Its numbers are never trusted: `planDistribution`
 * re-validates the proposal against the sheet's own jars and unallocated amount, and
 * the customer still edits and saves through the sheet (one atomic `postLedger` batch
 * the server caps again). Nothing here writes anything.
 */

import { isDistributeAmountUi, requestJarDistribute, type UiPayload } from "@/lib/agent-api";

/** How long the customer waits before the sheet simply stays as it is. */
export const AGENT_DISTRIBUTE_TIMEOUT_MS = 60_000;

export type DistributionPlan =
  | { ok: true; /** Amount to ADD to each jar's balance, by jar id. */ additions: Record<string, number>; reason: string }
  | { ok: false; reason: string };

/**
 * Turn a `distribute_amount` proposal into per-jar additions, or reject it whole: a
 * jar that is not one of `jarIds`, a repeated jar, a non-positive / fractional amount,
 * or a total above the unallocated `pool` drops the entire proposal — a half-applied
 * suggestion would not be the one the agent explained.
 */
export function planDistribution(ui: UiPayload | null | undefined, jarIds: readonly string[], pool: number): DistributionPlan {
  if (!isDistributeAmountUi(ui)) return { ok: false, reason: "Đề xuất không hợp lệ." };
  const known = new Set(jarIds);
  const additions: Record<string, number> = {};
  let total = 0;
  for (const a of ui.allocations) {
    if (!known.has(a.to_jar_id) || a.to_jar_id in additions) return { ok: false, reason: "Đề xuất nhắc tới hũ không còn hợp lệ." };
    additions[a.to_jar_id] = a.amount;
    total += a.amount;
  }
  if (total > pool) return { ok: false, reason: "Đề xuất vượt quá số tiền chưa phân bổ." };
  return { ok: true, additions, reason: ui.reason };
}

export type DistributionAnswer = { kind: "plan"; additions: Record<string, number>; reason: string } | { kind: "message"; text: string };

/**
 * Ask the agent to split `amount` and resolve what the sheet should show: a valid plan
 * to pre-fill, or a plain message (the agent's own `answer` when it has no proposal, a
 * fixed line for an invalid proposal / error / timeout).
 */
export async function askAgentToDistribute(input: { cif: string; amount: number; jarIds: readonly string[] }): Promise<DistributionAnswer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      requestJarDistribute({ cif: input.cif, amount: input.amount }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), AGENT_DISTRIBUTE_TIMEOUT_MS);
      }),
    ]);
    if (!reply.ui) return { kind: "message", text: reply.answer || "M-You chưa có gợi ý phù hợp lúc này." };
    const plan = planDistribution(reply.ui, input.jarIds, input.amount);
    return plan.ok ? { kind: "plan", additions: plan.additions, reason: plan.reason } : { kind: "message", text: plan.reason };
  } catch {
    return { kind: "message", text: "Chưa lấy được gợi ý từ M-You. Bạn thử lại sau nhé." };
  } finally {
    clearTimeout(timer);
  }
}
