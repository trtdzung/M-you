/**
 * The "Agent decides the rest" step of the transfer flow (Chuyển tiền): the customer
 * picks a jar as the source, enters more than it holds and taps "Tiếp tục" — the
 * engine already knows the jar is short (`evaluateFunding`).
 *
 * Only "Chưa phân bổ" is the engine's own: the pool gives what it can FIRST. Whatever
 * the pool cannot cover is the M-You agent's to propose, through `POST /jar-rebalance`
 * — the endpoint takes ONE source jar and an amount (contract 2026-09-24,
 * `agent_backend_docs/jars/endpoints.md`), so one call per jar the engine's chain draws
 * from (`topupAsks`), each pinned to the short jar with `to_jar_ids`. Until the agent
 * has answered, the popup shows the pool alone and "Đồng ý rót" stays off; if the agent
 * cannot answer (error, timeout, no proposal, a different move) the engine's own chain
 * stands in so a transfer is never stranded.
 *
 * The agent's numbers are never trusted: `checkDonorPlan` re-validates the plan against
 * the engine's jar snapshot, and `/transfer-confirm` runs the SAME check again on fresh
 * numbers before writing any leg — a plan that no longer fits is dropped and the engine's
 * chain applies instead. Nothing here moves money (#3).
 */

import { computeUnallocatedPool, POOL_DONOR_ID, POOL_DONOR_LABEL, type DonorProposal, type JarSpendable } from "@/domain/engine";
import { isRebalanceJarsUi, requestJarRebalance } from "@/lib/agent-api";

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

/** One call to the agent: this jar gives this much to the short jar. */
export interface TopupAsk {
  donorJarId: string;
  amount: number;
}

/** More jars than this and the engine's chain is used as is — each ask is a 10–25 s model call. */
export const MAX_TOPUP_ASKS = 3;

/**
 * What to ask the agent: one move per JAR the engine's chain draws from (the pool
 * part is never asked). `null` when the chain is pool-only — nothing left for the
 * agent — or draws from more than `MAX_TOPUP_ASKS` jars.
 */
export function topupAsks(donors: readonly DonorProposal[]): TopupAsk[] | null {
  const asks = donors.filter((d) => d.jarId !== POOL_DONOR_ID && d.take > 0).map((d) => ({ donorJarId: d.jarId, amount: d.take }));
  return asks.length > 0 && asks.length <= MAX_TOPUP_ASKS ? asks : null;
}

/**
 * Ask the agent to propose moving `amount` from `fromJarId` into `toJarId`, through
 * its conversation-free `/jar-rebalance` endpoint (nothing is written to the
 * customer's chat). Resolves the customer-facing `reason` when the agent proposes
 * exactly that move (`rebalance_jars`, this source, this one receiver, this amount),
 * or `null` for anything else — no proposal, a different move, a malformed one, an
 * error or the timeout. The caller then keeps the engine's chain.
 */
export async function askAgentForTopup(input: {
  cif: string;
  fromJarId: string;
  toJarId: string;
  amount: number;
}): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      requestJarRebalance({ cif: input.cif, fromJarId: input.fromJarId, amount: input.amount, toJarIds: [input.toJarId] }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), AGENT_TOPUP_TIMEOUT_MS);
      }),
    ]);
    const ui = reply.ui ?? null;
    if (!isRebalanceJarsUi(ui) || ui.from_jar_id !== input.fromJarId) return null;
    const [only] = ui.allocations;
    return ui.allocations.length === 1 && only.to_jar_id === input.toJarId && only.amount === input.amount ? ui.reason : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask for every move of `asks` at once (they are independent calls). Resolves the
 * agent's `reason` per move, in order, only when EVERY move came back as asked —
 * otherwise `null`, and the caller falls back to the engine's chain.
 */
export async function askAgentForTopups(input: { cif: string; toJarId: string; asks: readonly TopupAsk[] }): Promise<string[] | null> {
  const reasons = await Promise.all(
    input.asks.map((ask) => askAgentForTopup({ cif: input.cif, fromJarId: ask.donorJarId, toJarId: input.toJarId, amount: ask.amount })),
  );
  return reasons.every((r): r is string => r !== null) ? reasons : null;
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
