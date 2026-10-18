"use client";

import { useSecurityStore } from "@/state/security/store";
import { Notice } from "../../settings-ui";
import { SecurityLoading } from "../SecurityLoading";
import { ResetPanel } from "../test-tools/ResetPanel";
import { SkipWaitPanel } from "../test-tools/SkipWaitPanel";
import { StateSummary } from "../test-tools/StateSummary";

/** Settings › Công cụ test (demo): shortcuts for testers. Only touches simulated, on-device data. */
export function TestToolsScreen() {
  const hydrated = useSecurityStore(state => state.hasHydrated);
  if (!hydrated) return <SecurityLoading />;

  return <>
    <Notice>Công cụ dành cho người test. Chỉ đổi dữ liệu giả lập trên trình duyệt này, không ảnh hưởng tài khoản thật.</Notice>
    <StateSummary />
    <ResetPanel />
    <SkipWaitPanel />
  </>;
}
