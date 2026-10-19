"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Đóng mục tiêu — stub, owned by T3. Keep the export name: ui/registry.ts imports it. */
export function CloseGoalFlow({ params }: ScreenProps) {
  return <ScreenStub title="Đóng mục tiêu" params={params} />;
}
