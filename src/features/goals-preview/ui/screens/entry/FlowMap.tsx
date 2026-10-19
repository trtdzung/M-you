"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Bản đồ luồng — stub, owned by T6. Keep the export name: ui/registry.ts imports it. */
export function FlowMap({ params }: ScreenProps) {
  return <ScreenStub title="Bản đồ luồng" params={params} />;
}
