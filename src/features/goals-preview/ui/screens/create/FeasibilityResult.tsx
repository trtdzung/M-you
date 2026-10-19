"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Kết quả khả thi — stub, owned by T2. Keep the export name: ui/registry.ts imports it. */
export function FeasibilityResult({ params }: ScreenProps) {
  return <ScreenStub title="Kết quả khả thi" params={params} />;
}
