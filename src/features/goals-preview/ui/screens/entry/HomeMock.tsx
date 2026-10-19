"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Trang chủ — stub, owned by T6. Keep the export name: ui/registry.ts imports it. */
export function HomeMock({ params }: ScreenProps) {
  return <ScreenStub title="Trang chủ" params={params} />;
}
