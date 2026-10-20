"use client";

import type { GoalUi } from "@/lib/agent-goal-api";
import { AgentAssetCard } from "./AgentAssetCard";
import { AgentGoalAdjustCard } from "./AgentGoalAdjustCard";
import { AgentGoalCreateCard } from "./AgentGoalCreateCard";

/** Picks the card for a validated goal proposal (`isGoalUi`). A confirmed form only does its own work: it never messages the agent. */
export function AgentGoalUiCard({ ui, fullWidth = false }: { ui: GoalUi; fullWidth?: boolean }) {
  if (ui.type === "create_goal") return <AgentGoalCreateCard form={ui} fullWidth={fullWidth} />;
  if (ui.type === "edit_goal" || ui.type === "close_goal") return <AgentGoalAdjustCard form={ui} fullWidth={fullWidth} />;
  return <AgentAssetCard form={ui} fullWidth={fullWidth} />;
}
