"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Hoàn thành mục tiêu — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function CompletedCelebration({ params }: ScreenProps) {
  return <ScreenStub title="Hoàn thành mục tiêu" params={params} />;
}
