/**
 * The "Agent suggests how to top up a jar" step of the transfer flow (Chuyển tiền):
 * the customer picks a jar as the source, enters more than it holds and taps
 * "Tiếp tục" — the engine already knows the jar is short (`evaluateFunding`), and
 * here the M-You agent is ASKED how to cover the gap from other jars / the pool.
 *
 * The agent only proposes (`rebalance_jars`, contract in `backend_docs/pfm-read-api.md`
 * B4). Its numbers are never trusted: `checkDonorPlan` re-validates the plan against
 * the engine's jar snapshot, and `/transfer-confirm` runs the SAME check again on
 * fresh numbers before writing any leg — a plan that no longer fits is dropped and
 * the engine's own donor chain applies instead. Nothing here moves money (#3).
 */

import { computeUnallocatedPool, POOL_DONOR_ID, POOL_DONOR_LABEL, type DonorProposal, type JarSpendable } from "@/domain/engine";
import { isRebalanceJarsUi, requestJarCover, type RebalanceJarsUi } from "@/lib/agent-api";

/** How long the customer waits for the agent before the engine's chain is all there is. */
export const AGENT_TOPUP_TIMEOUT_MS = 60_000;

export type PlanCheck = { ok: true; donors: DonorProposal[] } | { ok: false; reason: string };

/** "Chưa phân bổ" the pool may give: `CASA − Σ spendable`, never negative. */
export function poolAvailable(casaBalance: number, jars: readonly JarSpendable[]): number {
  return Math.max(
    0,
    computeUnallocatedPool({ casaBalance, spendableTotal: jars.reduce((sum, j) => sum + (j.spendable ?? 0), 0) }).amount,
  );
}

/**
 * Whether a set of donor moves is a valid way to cover `shortfall` for `targetJarId`
 * on the CURRENT numbers: target exists with a limit, every source exists once and is
 * not the target, each amount is > 0 and within what the source can give (a jar's
 * `spendable`, the pool's unallocated amount), and the total equals the shortfall.
 */
export function checkDonorPlan(input: {
  moves: readonly { jarId: string; amount: number }[];
  targetJarId: string;
  shortfall: number;
  jars: readonly JarSpendable[];
  casaBalance: number;
}): PlanCheck {
  const { moves, targetJarId, shortfall, jars, casaBalance } = input;
  const target = jars.find((j) => j.id === targetJarId);
  if (!target || target.spendable === null) return { ok: false, reason: "Hũ nguồn tiền không còn hợp lệ." };
  if (moves.length === 0) return { ok: false, reason: "Đề xuất không có nguồn lấy tiền." };

  const pool = poolAvailable(casaBalance, jars);
  const seen = new Set<string>();
  const donors: DonorProposal[] = [];
  let total = 0;
  for (const move of moves) {
    if (move.jarId === targetJarId || seen.has(move.jarId)) return { ok: false, reason: "Đề xuất lặp hoặc lấy từ chính hũ đang thiếu." };
    seen.add(move.jarId);
    if (!Number.isFinite(move.amount) || move.amount <= 0) return { ok: false, reason: "Số tiền đề xuất không hợp lệ." };
    if (move.jarId === POOL_DONOR_ID) {
      if (move.amount > pool) return { ok: false, reason: "Tiền chưa phân bổ không đủ như đề xuất." };
      donors.push({ jarId: POOL_DONOR_ID, label: POOL_DONOR_LABEL, take: move.amount });
    } else {
      const donor = jars.find((j) => j.id === move.jarId);
      if (!donor || donor.spendable === null || move.amount > donor.spendable) {
        return { ok: false, reason: "Một hũ nguồn không còn đủ tiền như đề xuất." };
      }
      donors.push({ jarId: donor.id, label: donor.label, take: move.amount });
    }
    total += move.amount;
  }
  if (Math.abs(total - shortfall) >= 0.5) return { ok: false, reason: "Tổng đề xuất không khớp số còn thiếu." };
  return { ok: true, donors };
}

/**
 * Ask the agent how to cover a short jar for a planned spend, through its
 * conversation-free `/jar-rebalance` endpoint (`cover` mode — nothing is written to
 * the customer's chat). Resolves the proposal (`rebalance_jars` for exactly this jar)
 * with the customer-facing `reason`, or `null` for anything else — no proposal, a
 * malformed one, another jar, an error or the timeout. The caller then simply keeps
 * the engine's chain.
 */
export async function askAgentForTopup(input: {
  cif: string;
  amount: number;
  jarId: string;
}): Promise<RebalanceJarsUi | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      requestJarCover({ cif: input.cif, targetJarId: input.jarId, spendAmount: input.amount }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), AGENT_TOPUP_TIMEOUT_MS);
      }),
    ]);
    const ui = reply.ui ?? null;
    return isRebalanceJarsUi(ui) && ui.target_jar_id === input.jarId ? ui : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * At `/transfer-confirm`: swap the engine's donor chain for the plan the customer
 * accepted from the agent — but only if it still fits the FRESH numbers (same
 * `checkDonorPlan` as when it was shown). The shortfall and target stay the
 * engine's; only the split across donors is the agent's. Anything that does not
 * fit (stale plan, other jar, engine now says `ok`) returns the engine's assessment
 * untouched and `byAgent: false`, so the transfer still funds itself the usual way.
 */
export function applyAgentPlan<A extends { tier: string; shortfall: number; targetJarId: string | null; donors: DonorProposal[] }>(
  assessment: A,
  planned: { donors: DonorProposal[]; targetJarId: string | null; by?: "agent" } | undefined,
  snapshot: { spendables: readonly JarSpendable[]; casaBalance: number },
): { assessment: A; byAgent: boolean } {
  if (
    planned?.by !== "agent" ||
    assessment.tier !== "topup" ||
    assessment.targetJarId === null ||
    planned.targetJarId !== assessment.targetJarId
  ) {
    return { assessment, byAgent: false };
  }
  const check = checkDonorPlan({
    moves: planned.donors.map((d) => ({ jarId: d.jarId, amount: d.take })),
    targetJarId: assessment.targetJarId,
    shortfall: assessment.shortfall,
    jars: snapshot.spendables,
    casaBalance: snapshot.casaBalance,
  });
  return check.ok ? { assessment: { ...assessment, donors: check.donors }, byAgent: true } : { assessment, byAgent: false };
}
