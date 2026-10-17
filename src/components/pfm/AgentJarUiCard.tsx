"use client";

import type { JarUi } from "@/lib/agent-api";
import { AgentJarFormCard } from "./AgentJarFormCard";
import { AgentRebalanceCard } from "./AgentRebalanceCard";

/** Picks the card for a validated jar proposal (`isJarUi`): create/edit form or rebalance. */
export function AgentJarUiCard({ ui, fullWidth = false }: { ui: JarUi; fullWidth?: boolean }) {
  return ui.type === "rebalance_jars" ? (
    <AgentRebalanceCard form={ui} fullWidth={fullWidth} />
  ) : (
    <AgentJarFormCard form={ui} fullWidth={fullWidth} />
  );
}
