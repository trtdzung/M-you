"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Chọn loại mục tiêu — stub, owned by T2. Keep the export name: ui/registry.ts imports it. */
export function TemplatePick({ params }: ScreenProps) {
  return <ScreenStub title="Chọn loại mục tiêu" params={params} />;
}
