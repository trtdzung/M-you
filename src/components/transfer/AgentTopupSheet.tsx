"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersona } from "@/providers/context";
import { askAgentForTopups, checkDonorPlan, topupAsks } from "@/lib/agent-rebalance";
import type { DonorProposal, FundingAssessment, JarSpendable } from "@/domain/engine";
import { JarTopupSuggestionSheet, type AgentTopup } from "./JarTopupSuggestionSheet";

/**
 * The top-up popup of the transfer flow, with the M-You agent deciding everything
 * the pool cannot cover.
 *
 * "Chưa phân bổ" comes first and is the engine's alone: while it covers the whole
 * shortfall the chain (the pool alone) IS the suggestion and the agent is not asked.
 * Beyond the pool, the agent is asked one move per jar the engine's chain draws from
 * (`topupAsks`); until it answers the popup shows the pool part only and "Đồng ý rót"
 * is off. When it returns exactly the asked moves AND `checkDonorPlan` accepts the
 * resulting chain against the current jar snapshot, its `reason`s are shown and
 * "Đồng ý rót" carries the plan (`by: "agent"`). Anything else — no proposal, a
 * different move, an error, the timeout — falls back to the engine's chain, so the
 * transfer is never stranded. The agent only ever suggests; `/transfer-confirm`
 * re-checks the plan on fresh numbers before applying anything.
 */
export function AgentTopupSheet({
  assessment,
  jarId,
  targetLabel,
  jars,
  casaBalance,
  onAccept,
  onChooseAnother,
  onClose,
}: {
  assessment: FundingAssessment;
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
  // One question per opening of the popup: the chain the asks come from and the plan is
  // checked against is read through a ref-free closure of the FIRST render's props on
  // purpose — a re-render must not re-ask (each ask is a model call).
  const snapshot = useMemo(
    () => ({
      jars,
      casaBalance,
      shortfall: assessment.shortfall,
      donors: assessment.donors,
      asks: jarId === null ? null : topupAsks(assessment.donors),
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [agent, setAgent] = useState<AgentTopup>(snapshot.asks ? { status: "loading" } : { status: "idle" });

  useEffect(() => {
    const asks = snapshot.asks;
    if (!jarId || !asks) return;
    let cancelled = false;
    askAgentForTopups({ cif, toJarId: jarId, asks }).then((reasons) => {
      if (cancelled) return;
      if (!reasons) return setAgent({ status: "none" });
      const check = checkDonorPlan({
        moves: snapshot.donors.map((d) => ({ jarId: d.jarId, amount: d.take })),
        targetJarId: jarId,
        shortfall: snapshot.shortfall,
        jars: snapshot.jars,
        casaBalance: snapshot.casaBalance,
      });
      setAgent(check.ok ? { status: "ready", donors: check.donors, reasons } : { status: "none" });
    });
    return () => {
      cancelled = true;
    };
  }, [cif, jarId, snapshot]);

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
