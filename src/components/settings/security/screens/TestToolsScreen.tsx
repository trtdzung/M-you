"use client";

import { useSecurityStore } from "@/state/security/store";
import { Notice } from "../../settings-ui";
import { SecurityLoading } from "../SecurityLoading";
import { CaseUpdatePanel } from "../test-tools/CaseUpdatePanel";
import { FraudAgentPanel } from "../test-tools/FraudAgentPanel";
import { AlertHourPanel } from "../test-tools/AlertHourPanel";
import { AlertLogPanel } from "../test-tools/AlertLogPanel";
import { FabTogglePanel } from "../test-tools/FabTogglePanel";
import { PresetPanel } from "../test-tools/PresetPanel";
import { ResetPanel } from "../test-tools/ResetPanel";
import { ScenarioPanel } from "../test-tools/ScenarioPanel";
import { SkipWaitPanel } from "../test-tools/SkipWaitPanel";
import { StateSummary } from "../test-tools/StateSummary";

/** Settings › Công cụ test (demo): shortcuts for testers. Only touches simulated, on-device data. */
export function TestToolsScreen() {
  const hydrated = useSecurityStore(state => state.hasHydrated);
  if (!hydrated) return <SecurityLoading />;

  return <>
    <Notice>Công cụ dành cho người test. Chỉ đổi dữ liệu giả lập trên trình duyệt này, không ảnh hưởng tài khoản thật.</Notice>
    <FraudAgentPanel />
    <FabTogglePanel />
    <StateSummary />
    <PresetPanel />
    <AlertHourPanel />
    <CaseUpdatePanel />
    <ScenarioPanel />
    <ResetPanel />
    <SkipWaitPanel />
    <AlertLogPanel />
  </>;
}
