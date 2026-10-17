"use client";

import type { JarUi } from "@/lib/agent-api";
import { AgentDistributeCard } from "./AgentDistributeCard";
import { AgentJarFormCard } from "./AgentJarFormCard";
import { AgentRebalanceCard } from "./AgentRebalanceCard";

/** Picks the card for a validated jar proposal (`isJarUi`): create/edit form, balance move or distribution. */
export function AgentJarUiCard({ ui, fullWidth = false }: { ui: JarUi; fullWidth?: boolean }) {
  if (ui.type === "rebalance_jars") return <AgentRebalanceCard form={ui} fullWidth={fullWidth} />;
  if (ui.type === "distribute_amount") return <AgentDistributeCard form={ui} fullWidth={fullWidth} />;
  return <AgentJarFormCard form={ui} fullWidth={fullWidth} />;
}
