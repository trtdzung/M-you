"use client";

import type { ScreenProps } from "../../../model/screens";
import { ScreenStub } from "../../shared/ScreenStub";

/** Tiền & tài sản ban đầu — stub, owned by T2. Keep the export name: ui/registry.ts imports it. */
export function OpeningFunds({ params }: ScreenProps) {
  return <ScreenStub title="Tiền & tài sản ban đầu" params={params} />;
}
