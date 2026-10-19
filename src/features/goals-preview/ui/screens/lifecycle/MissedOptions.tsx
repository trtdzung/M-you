"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Chưa đạt mục tiêu — stub, owned by T5. Keep the export name: ui/registry.ts imports it. */
export function MissedOptions({ params }: ScreenProps) {
  return <ScreenStub title="Chưa đạt mục tiêu" params={params} />;
}
