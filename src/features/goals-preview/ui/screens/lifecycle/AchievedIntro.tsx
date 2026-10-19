"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Đạt mục tiêu — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function AchievedIntro({ params }: ScreenProps) {
  return <ScreenStub title="Đạt mục tiêu" params={params} />;
}
