"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Trích tiền tự động — stub, owned by T3. Keep the export name: ui/registry.ts imports it. */
export function StandingOrderManage({ params }: ScreenProps) {
  return <ScreenStub title="Trích tiền tự động" params={params} />;
}
