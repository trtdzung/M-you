"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Lịch trả nợ — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function RepaySchedule({ params }: ScreenProps) {
  return <ScreenStub title="Lịch trả nợ" params={params} />;
}
