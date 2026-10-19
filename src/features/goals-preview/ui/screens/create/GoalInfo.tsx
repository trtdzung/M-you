"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Thông tin mục tiêu — stub, owned by T2. Keep the export name: ui/registry.ts imports it. */
export function GoalInfo({ params }: ScreenProps) {
  return <ScreenStub title="Thông tin mục tiêu" params={params} />;
}
