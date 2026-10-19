"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Bán tài sản — stub, owned by T4. Keep the export name: ui/registry.ts imports it. */
export function SellAsset({ params }: ScreenProps) {
  return <ScreenStub title="Bán tài sản" params={params} />;
}
