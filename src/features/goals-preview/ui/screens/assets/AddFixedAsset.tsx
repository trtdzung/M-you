"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Thêm tài sản cố định — stub, owned by T4. Keep the export name: ui/registry.ts imports it. */
export function AddFixedAsset({ params }: ScreenProps) {
  return <ScreenStub title="Thêm tài sản cố định" params={params} />;
}
