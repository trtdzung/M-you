"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Chi tiết tài sản — stub, owned by T4. Keep the export name: ui/registry.ts imports it. */
export function LiquidAssetDetail({ params }: ScreenProps) {
  return <ScreenStub title="Chi tiết tài sản" params={params} />;
}
