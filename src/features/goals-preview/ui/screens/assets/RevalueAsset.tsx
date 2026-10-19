"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Định giá lại tài sản — stub, owned by T4. Keep the export name: ui/registry.ts imports it. */
export function RevalueAsset({ params }: ScreenProps) {
  return <ScreenStub title="Định giá lại tài sản" params={params} />;
}
