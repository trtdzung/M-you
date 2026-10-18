"use client";

import { useSecurityStore } from "@/state/security/store";
import { Notice } from "../../settings-ui";
import { SecurityLoading } from "../SecurityLoading";
import { CaseUpdatePanel } from "../test-tools/CaseUpdatePanel";
import { ClockPanel } from "../test-tools/ClockPanel";
import { EventsPanel } from "../test-tools/EventsPanel";
import { FraudAgentPanel } from "../test-tools/FraudAgentPanel";
import { FrequencyPanel } from "../test-tools/FrequencyPanel";
import { HoldSkipPanel } from "../test-tools/HoldSkipPanel";
import { IncomingPanel } from "../test-tools/IncomingPanel";
import { AlertLogPanel } from "../test-tools/AlertLogPanel";
import { FabTogglePanel } from "../test-tools/FabTogglePanel";
import { PresetPanel } from "../test-tools/PresetPanel";
import { ResetPanel } from "../test-tools/ResetPanel";
import { ScenarioPanel } from "../test-tools/ScenarioPanel";
import { SkipWaitPanel } from "../test-tools/SkipWaitPanel";
import { StateSummary } from "../test-tools/StateSummary";
import { WarnedPanel } from "../test-tools/WarnedPanel";

/** Settings › Công cụ test (demo): shortcuts that write this persona's simulated engine data. */
export function TestToolsScreen() {
  const hydrated = useSecurityStore(state => state.hasHydrated);
  if (!hydrated) return <SecurityLoading />;

  return <>
    <Notice>Công cụ dành cho người test. Dữ liệu giả lập ghi trên server của persona này, không ảnh hưởng tài khoản thật.</Notice>
    <FraudAgentPanel />
    <FabTogglePanel />
    <StateSummary />
    <PresetPanel />
    <ClockPanel />
    <IncomingPanel />
    <EventsPanel />
    <WarnedPanel />
    <FrequencyPanel />
    <HoldSkipPanel />
    <CaseUpdatePanel />
    <ScenarioPanel />
    <ResetPanel />
    <SkipWaitPanel />
    <AlertLogPanel />
  </>;
}
