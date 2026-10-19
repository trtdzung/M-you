"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Xác nhận đầu tư — stub, owned by T4. Keep the export name: ui/registry.ts imports it. */
export function InvestConfirm({ params }: ScreenProps) {
  return <ScreenStub title="Xác nhận đầu tư" params={params} />;
}
