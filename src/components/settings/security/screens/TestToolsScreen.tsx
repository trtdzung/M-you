"use client";

import { useSecurityStore } from "@/state/security/store";
import { Notice } from "../../settings-ui";
import { SecurityLoading } from "../SecurityLoading";
import { CaseUpdatePanel } from "../test-tools/CaseUpdatePanel";
import { ClockPanel } from "../test-tools/ClockPanel";
import { EngineBoard } from "../test-tools/EnginePanel";
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
    <nav aria-label="Công cụ kiểm thử" className="flex flex-wrap gap-2"><a className="shield-action" href="#shield-test-scenarios">Thẻ kịch bản</a><a className="shield-action" href="#shield-test-clock">Giờ mô phỏng</a><a className="shield-action" href="#shield-test-reset">Đặt lại dữ liệu</a></nav>
    <EngineBoard />
    <FraudAgentPanel />
    <FabTogglePanel />
    <StateSummary />
    <PresetPanel />
    <div id="shield-test-clock"><ClockPanel /></div>
    <IncomingPanel />
    <EventsPanel />
    <WarnedPanel />
    <FrequencyPanel />
    <HoldSkipPanel />
    <CaseUpdatePanel />
    <div id="shield-test-scenarios"><ScenarioPanel /></div>
    <div id="shield-test-reset"><ResetPanel /></div>
    <SkipWaitPanel />
    <AlertLogPanel />
  </>;
}
