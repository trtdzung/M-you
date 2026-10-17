"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersona } from "@/providers/context";
import { askAgentForTopup, checkDonorPlan, poolAvailable } from "@/lib/agent-rebalance";
import type { DonorProposal, FundingAssessment, JarSpendable } from "@/domain/engine";
import { JarTopupSuggestionSheet, type AgentTopup } from "./JarTopupSuggestionSheet";

/**
 * The top-up popup of the transfer flow with the M-Your agent's suggestion on top.
 *
 * "Chưa phân bổ" comes first: while it covers the whole shortfall the engine's chain
 * (the pool alone) IS the suggestion and the agent is not asked. Only when the
 * shortfall goes beyond the pool is the agent asked how to cover the rest from other jars.
 *
 * The engine's donor chain shows at once (the agent takes 10–40 s); when the agent
 * answers with a `rebalance_jars` for this same jar AND `checkDonorPlan` accepts it
 * against the current jar snapshot, its plan replaces the chain and "Đồng ý rót"
 * carries it (`by: "agent"`). Anything else — no proposal, a plan that does not fit,
 * an error, or a pool source (the contract's target must be a jar) — leaves the
 * engine's chain in charge. The agent only ever suggests; `/transfer-confirm`
 * re-checks the plan on fresh numbers before applying anything.
 */
export function AgentTopupSheet({
  assessment,
  amount,
  jarId,
  targetLabel,
  jars,
  casaBalance,
  onAccept,
  onChooseAnother,
  onClose,
}: {
  assessment: FundingAssessment;
  amount: number;
  /** The short jar; `null` for the pool source (no agent call then). */
  jarId: string | null;
  targetLabel: string;
  jars: readonly JarSpendable[];
  casaBalance: number;
  onAccept: (planned: { donors: DonorProposal[]; targetJarId: string | null; by?: "agent" }) => void;
  onChooseAnother: () => void;
  onClose: () => void;
}) {
  const { persona } = usePersona();
  const cif = persona.cif;
  // Ask only for a jar source whose shortfall the pool cannot cover on its own.
  const needsAgent = jarId !== null && assessment.shortfall > poolAvailable(casaBalance, jars);
  const [agent, setAgent] = useState<AgentTopup>(needsAgent ? { status: "loading" } : { status: "idle" });

  // One question per opening of the popup: the snapshot the plan is checked against
  // is read through a ref-free closure of the FIRST render's props on purpose — a
  // re-render must not re-ask (each ask is a chat turn).
  const snapshot = useMemo(() => ({ jars, casaBalance, shortfall: assessment.shortfall }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!jarId || !needsAgent) return;
    let cancelled = false;
    askAgentForTopup({ cif, amount, jarId }).then((ui) => {
      if (cancelled) return;
      if (!ui) return setAgent({ status: "none" });
      const check = checkDonorPlan({
        moves: ui.moves.map((m) => ({ jarId: m.from_jar_id, amount: m.amount })),
        targetJarId: jarId,
        shortfall: snapshot.shortfall,
        jars: snapshot.jars,
        casaBalance: snapshot.casaBalance,
      });
      setAgent(check.ok ? { status: "ready", donors: check.donors, reason: ui.reason } : { status: "none" });
    });
    return () => {
      cancelled = true;
    };
  }, [cif, amount, jarId, needsAgent, snapshot]);

  return (
    <JarTopupSuggestionSheet
      assessment={assessment}
      targetLabel={targetLabel}
      agent={agent}
      onClose={onClose}
      onChooseAnother={onChooseAnother}
      onAccept={() =>
        agent.status === "ready"
          ? onAccept({ donors: agent.donors, targetJarId: assessment.targetJarId, by: "agent" })
          : onAccept({ donors: assessment.donors, targetJarId: assessment.targetJarId })
      }
    />
  );
}
