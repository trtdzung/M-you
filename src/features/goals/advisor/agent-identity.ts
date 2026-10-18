import "server-only";

import { createHash } from "node:crypto";
import { buildAdvisorContext } from "./context";

/** Pseudonym sent to the agent instead of the CIF: salted hash, same customer -> same alias. */
export function agentAlias(cif: string): string {
  const salt = process.env.GOAL_ADVISOR_USER_SALT ?? "";
  return "u_" + createHash("sha256").update(`${salt}:${cif}`).digest("hex").slice(0, 24);
}

export interface AgentContext {
  surplus: number | null;
  savings_balance: number | null;
  jars: { id: string; label: string; spendable: number }[];
  missing: string[];
}

/**
 * Aggregated figures for the agent's chips (surplus, savings, spendable jars, what is unknown).
 * No transactions, no account numbers, no names. null when the engine cannot be read: the coach still works.
 */
export function agentContext(cif: string, now: Date): AgentContext | null {
  try {
    const c = buildAdvisorContext(cif, now);
    return {
      surplus: c.surplus === "unknown" ? null : c.surplus,
      savings_balance: c.balances.savings,
      jars: c.jars.flatMap((j) => (j.spendable !== null && j.spendable > 0 ? [{ id: j.id, label: j.label, spendable: j.spendable }] : [])).slice(0, 8),
      missing: c.dataQuality.unknown.slice(0, 8),
    };
  } catch (err) {
    console.error("[goal-advisor] agent context unavailable", err instanceof Error ? err.name : "error");
    return null;
  }
}
