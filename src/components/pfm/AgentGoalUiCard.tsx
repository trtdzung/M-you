"use client";

import type { GoalUi } from "@/lib/agent-goal-api";
import { AgentAssetCard } from "./AgentAssetCard";
import { AgentGoalAdjustCard } from "./AgentGoalAdjustCard";
import { AgentGoalCreateCard } from "./AgentGoalCreateCard";

/** Picks the card for a validated goal proposal (`isGoalUi`). `onCreated` is told the name of a goal the customer just created. */
export function AgentGoalUiCard({ ui, fullWidth = false, onCreated }: { ui: GoalUi; fullWidth?: boolean; onCreated?: (goalName: string) => void }) {
  if (ui.type === "create_goal") return <AgentGoalCreateCard form={ui} fullWidth={fullWidth} onCreated={onCreated} />;
  if (ui.type === "edit_goal" || ui.type === "close_goal") return <AgentGoalAdjustCard form={ui} fullWidth={fullWidth} />;
  return <AgentAssetCard form={ui} fullWidth={fullWidth} />;
}
