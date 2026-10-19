"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Chi tiết mục tiêu — stub, owned by T3. Keep the export name: ui/registry.ts imports it. */
export function GoalDetail({ params }: ScreenProps) {
  return <ScreenStub title="Chi tiết mục tiêu" params={params} />;
}
